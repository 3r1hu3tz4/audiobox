from flask import Flask, render_template, request, send_file, jsonify
import asyncio
import edge_tts
import io
import os
import re
import uuid
import threading
import PyPDF2
import docx
import subprocess
from pydub import AudioSegment
import imageio_ffmpeg
from dotenv import load_dotenv
import mercadopago
from supabase import create_client, Client

load_dotenv()

AudioSegment.converter = imageio_ffmpeg.get_ffmpeg_exe()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB limit

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") # Llave pública (anon key)
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") # Llave maestra (bypasses RLS)

# Si existe la llave maestra, el backend la usa para tener permisos de Administrador
admin_key = SUPABASE_SERVICE_KEY if SUPABASE_SERVICE_KEY else SUPABASE_KEY
supabase: Client = create_client(SUPABASE_URL, admin_key) if SUPABASE_URL and admin_key else None

MP_ACCESS_TOKEN = os.environ.get("MERCADOPAGO_ACCESS_TOKEN")
mp_sdk = mercadopago.SDK(MP_ACCESS_TOKEN) if MP_ACCESS_TOKEN else None

@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify({
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_ANON_KEY": SUPABASE_KEY
    })

# Mapping our app languages to gTTS languages
# gTTS supports standard codes like 'es', 'en', 'fr', 'pt'
# For Chinese we map 'zh' to 'zh-cn' (Mandarin)
LANG_MAP = {
    'es': 'es-MX-DaliaNeural',
    'en': 'en-US-AriaNeural',
    'fr': 'fr-FR-DeniseNeural',
    'pt': 'pt-BR-FranciscaNeural',
    'zh': 'zh-CN-XiaoxiaoNeural',
    'it': 'it-IT-ElsaNeural',
    'ru': 'ru-RU-SvetlanaNeural',
    'ko': 'ko-KR-SunHiNeural'
}

tasks = {}
os.makedirs("temp_audio", exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

def is_heading(line):
    line = line.strip()
    if not line:
        return False
    if len(line) > 100:
        return False
    letters = [c for c in line if c.isalpha()]
    if letters and len(letters) >= 3 and all(c.isupper() for c in letters):
        return True
    heading_patterns = [
        r'^(cap[ií]tulo|chapter|secci[oó]n|tema|m[oó]dulo|unidad|lecci[oó]n|parte|t[ií]tulo)\s+\d+',
        r'^\d+(\.\d+)*\s+[A-ZÁÉÍÓÚÑ]',
        r'^[IVXLCDM]+\.\s+[A-ZÁÉÍÓÚÑ]',
    ]
    for pattern in heading_patterns:
        if re.match(pattern, line, re.IGNORECASE):
            return True
    return False

def is_question(sentence):
    s = sentence.strip()
    return s.startswith('¿') or s.endswith('?')

def format_extracted_text(raw_text):
    if not raw_text or not raw_text.strip():
        return ""
    
    raw_text = raw_text.replace('\r\n', '\n').replace('\r', '\n')
    raw_lines = raw_text.split('\n')
    
    blocks = []
    current_block = []
    
    for line in raw_lines:
        sline = line.strip()
        if not sline:
            if current_block:
                blocks.append(('text', ' '.join(current_block)))
                current_block = []
            continue
            
        if is_heading(sline):
            if current_block:
                blocks.append(('text', ' '.join(current_block)))
                current_block = []
            blocks.append(('heading', sline))
        else:
            if current_block and current_block[-1].endswith('-'):
                current_block[-1] = current_block[-1][:-1] + sline
            else:
                current_block.append(sline)
                
    if current_block:
        blocks.append(('text', ' '.join(current_block)))
        
    formatted_output = []
    abbreviations = {'dr', 'dra', 'sr', 'sra', 'srta', 'prof', 'lic', 'ing', 'etc', 'ej', 'pág', 'pag', 'págs', 'num', 'núm', 'no', 'art', 'vol', 'cap', 'vs', 'inc', 'corp', 'dept', 'av', 'sta', 'sto'}
    
    for btype, content in blocks:
        if btype == 'heading':
            formatted_output.append(f"\n{content}\n")
        else:
            parts = re.split(r'(\.|\!|\?)(?=\s+[A-ZÁÉÍÓÚÑ0-9¿¡"\'\(\[\-]|\s*$)|(?=\s*¿)', content)
            sentences = []
            cur_sentence = ""
            i = 0
            while i < len(parts):
                part = parts[i]
                if not part:
                    i += 1
                    continue
                if part in ('.', '!', '?'):
                    cur_sentence += part
                    words = cur_sentence.strip().split()
                    last_word = words[-1].lower().rstrip('.!?') if words else ''
                    if last_word in abbreviations and i + 1 < len(parts):
                        pass
                    else:
                        sentences.append(cur_sentence.strip())
                        cur_sentence = ""
                else:
                    if cur_sentence.strip() and part.strip().startswith('¿'):
                        sentences.append(cur_sentence.strip())
                        cur_sentence = part
                    else:
                        cur_sentence += part
                i += 1
                
            if cur_sentence.strip():
                sentences.append(cur_sentence.strip())
                
            sentences = [s for s in sentences if s]
            
            block_lines = []
            for s in sentences:
                if is_question(s):
                    # Questions receive an extra line break to stand out clearly
                    block_lines.append(f"\n\t{s}\n")
                else:
                    block_lines.append(f"\t{s}")
                    
            if block_lines:
                formatted_output.append("\n".join(block_lines))
                
    result = "\n".join(formatted_output)
    result = re.sub(r'\n{3,}', '\n\n', result).strip()
    return result

@app.route('/api/format', methods=['POST'])
def format_text_endpoint():
    text = request.form.get('text', '')
    if not text.strip():
        return jsonify({"error": "No text provided"}), 400
    formatted = format_extracted_text(text)
    return jsonify({"text": formatted})

@app.route('/api/extract', methods=['POST'])
def extract_text():
    if not supabase:
        return jsonify({"error": "Supabase no está configurado."}), 500

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "No autorizado. Inicia sesión para subir archivos."}), 401
    
    token = auth_header.split(" ")[1]
    
    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as e:
        return jsonify({"error": "Token inválido o expirado."}), 401

    try:
        profile_res = supabase.table("profiles").select("archivos_disponibles").eq("id", user_id).execute()
        if not profile_res.data:
            # Auto-create profile if missing
            supabase.table("profiles").insert({
                "id": user_id, 
                "email": user_response.user.email,
                "archivos_disponibles": 3
            }).execute()
            archivos_disponibles = 3
        else:
            archivos_disponibles = profile_res.data[0].get("archivos_disponibles", 0)
        
        if archivos_disponibles <= 0:
            return jsonify({"error": "No te quedan archivos disponibles. Por favor, compra un paquete extra."}), 403
            
    except Exception as e:
        return jsonify({"error": f"Error verificando cuenta: {str(e)}"}), 500

    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    raw_text = ""
    ext = file.filename.split('.')[-1].lower()

    try:
        if ext == 'txt':
            raw_text = file.read().decode('utf-8', errors='ignore')
        elif ext == 'pdf':
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                try:
                    page_text = page.extract_text()
                    if page_text:
                        raw_text += page_text + "\n"
                except Exception:
                    continue
        elif ext == 'docx':
            doc = docx.Document(file)
            for para in doc.paragraphs:
                raw_text += para.text + "\n"
        else:
            return jsonify({"error": f"Formato no soportado: {ext}"}), 400
    except Exception as e:
        return jsonify({"error": f"Error al leer el archivo: {str(e)}"}), 500

    if not raw_text.strip():
        return jsonify({"error": "No se pudo extraer texto del archivo (el documento podría estar vacío o ser una imagen escaneada)."}), 400

    # Decrement available files
    try:
        supabase.table("profiles").update({"archivos_disponibles": archivos_disponibles - 1}).eq("id", user_id).execute()
    except Exception as e:
        print(f"Error decrementando archivos_disponibles: {e}")
        # Consider whether to block here or just log

    # Auto-format the extracted text by default
    formatted_text = format_extracted_text(raw_text)

    # Base filename without extension
    base_name = os.path.splitext(file.filename)[0]

    return jsonify({
        "text": formatted_text,
        "filename": f"{base_name}_formateado.txt"
    })

async def _generate_audio_chunks(task_id, chunks, tts_lang):
    total_chunks = len(chunks)
    combined_mp3_path = os.path.join("temp_audio", f"{task_id}_combined.mp3")
    
    with open(combined_mp3_path, "wb") as outfile:
        for i, chunk in enumerate(chunks):
            if tasks[task_id].get('status') == 'cancelled':
                if os.path.exists(combined_mp3_path):
                    os.remove(combined_mp3_path)
                return None
                
            try:
                communicate = edge_tts.Communicate(chunk, tts_lang)
                # Edge-TTS generates MP3 natively. We save it to a temporary file.
                temp_chunk_path = os.path.join("temp_audio", f"{task_id}_chunk_{i}.mp3")
                await communicate.save(temp_chunk_path)
                
                # Append the bytes to the combined file
                with open(temp_chunk_path, "rb") as infile:
                    outfile.write(infile.read())
                
                # Clean up the chunk file
                if os.path.exists(temp_chunk_path):
                    os.remove(temp_chunk_path)
            except Exception as e:
                print(f"Skipping chunk {i} due to error: {e}")
                pass
            
            # Progress calculation (5% to 90%)
            progress = 5 + int(((i + 1) / total_chunks) * 85)
            tasks[task_id]['progress'] = progress
        
    return combined_mp3_path

def process_audio(task_id, text, tts_lang, audio_format):
    try:
        tasks[task_id]['progress'] = 5
        # Split text into chunks to track progress
        # Split by typical sentence boundaries
        chunks = [c.strip() for c in re.split(r'(?<=[.!?\n])\s+', text) if c.strip()]
        if not chunks:
            chunks = [text]
            
        # Run the async generation
        combined_mp3_path = asyncio.run(_generate_audio_chunks(task_id, chunks, tts_lang))
        
        if not combined_mp3_path or tasks[task_id].get('status') == 'cancelled':
            return
            
        if not os.path.exists(combined_mp3_path) or os.path.getsize(combined_mp3_path) == 0:
            raise ValueError("No se pudo generar ningún audio válido. Verifica que el texto contenga palabras y no solo símbolos.")
            
        # Export logic (90% to 100%)
        tasks[task_id]['progress'] = 90
        
        ext = audio_format
        if audio_format == 'mp3':
            mimetype = "audio/mpeg"
        elif audio_format == 'wav':
            mimetype = "audio/wav"
        elif audio_format == 'ogg':
            mimetype = "audio/ogg"
        elif audio_format == 'aac':
            mimetype = "audio/aac"
        else:
            tasks[task_id]['status'] = 'error'
            tasks[task_id]['error'] = f"Unsupported format: {audio_format}"
            return
            
        filepath = os.path.join("temp_audio", f"{task_id}.{ext}")
        
        if audio_format == 'mp3':
            if os.path.exists(filepath):
                os.remove(filepath)
            os.rename(combined_mp3_path, filepath)
        else:
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            subprocess.run([ffmpeg_exe, '-y', '-i', combined_mp3_path, filepath], 
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            if os.path.exists(combined_mp3_path):
                os.remove(combined_mp3_path)
            
        tasks[task_id]['filepath'] = filepath
        tasks[task_id]['mimetype'] = mimetype
        tasks[task_id]['ext'] = ext
        tasks[task_id]['progress'] = 100
        tasks[task_id]['status'] = 'completed'
        
    except Exception as e:
        print("Error during TTS processing:", e)
        tasks[task_id]['status'] = 'error'
        tasks[task_id]['error'] = str(e)


@app.route('/api/convert', methods=['POST'])
def convert_text_to_audio():
    if 'text' not in request.form:
        return jsonify({"error": "No text provided"}), 400

    text = ""
    
    if 'file' in request.files:
        file = request.files['file']
        if file.filename != '':
            try:
                text = file.read().decode('utf-8')
            except Exception as e:
                return jsonify({"error": f"Failed to read file: {str(e)}"}), 400
                
    if not text and 'text' in request.form:
        text = request.form.get('text', '').strip()

    if not text:
        return jsonify({"error": "Text is empty"}), 400

    lang_code = request.form.get('lang', 'es')
    audio_format = request.form.get('format', 'mp3').lower()
    gtts_lang = LANG_MAP.get(lang_code, 'es-MX-DaliaNeural')
    
    if audio_format not in ['mp3', 'wav', 'ogg', 'aac']:
        return jsonify({"error": "Unsupported format"}), 400

    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        'status': 'processing',
        'progress': 0
    }
    
    # Start background thread
    thread = threading.Thread(target=process_audio, args=(task_id, text, gtts_lang, audio_format))
    thread.daemon = True
    thread.start()

    return jsonify({"task_id": task_id})

@app.route('/api/status/<task_id>', methods=['GET'])
def get_status(task_id):
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404
    return jsonify({
        "status": tasks[task_id]['status'],
        "progress": tasks[task_id]['progress'],
        "error": tasks[task_id].get('error')
    })

@app.route('/api/cancel/<task_id>', methods=['POST'])
def cancel_task(task_id):
    if task_id in tasks:
        if tasks[task_id]['status'] == 'processing':
            tasks[task_id]['status'] = 'cancelled'
        return jsonify({"success": True})
    return jsonify({"error": "Task not found"}), 404

@app.route('/api/visit', methods=['POST'])
def register_visit():
    try:
        # Insert a new visit record
        supabase.table("page_views").insert({}).execute()
        
        # Get the total count
        response = supabase.table("page_views").select("*", count="exact").limit(1).execute()
        total_visits = response.count if response.count is not None else 0
        return jsonify({"visits": total_visits})
    except Exception as e:
        print("Error recording visit:", e)
        return jsonify({"visits": "---"}), 500

@app.route('/api/download/<task_id>', methods=['GET'])
def download_audio(task_id):
    if task_id not in tasks or tasks[task_id]['status'] != 'completed':
        return jsonify({"error": "Invalid or incomplete task"}), 400
        
    filepath = tasks[task_id]['filepath']
    mimetype = tasks[task_id]['mimetype']
    ext = tasks[task_id]['ext']
    
    return send_file(
        filepath,
        mimetype=mimetype,
        as_attachment=True,
        download_name=f"vocalize_audio.{ext}"
    )

@app.route('/api/checkout', methods=['POST'])
def create_checkout():
    if not mp_sdk:
        return jsonify({"error": "Mercado Pago no está configurado."}), 500
        
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "No autorizado. Inicia sesión primero."}), 401
    
    token = auth_header.split(" ")[1]
    
    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
        user_email = user_response.user.email
    except Exception as e:
        return jsonify({"error": "Token inválido o expirado."}), 401

    base_url = request.host_url.rstrip("/")
    if "127.0.0.1" in base_url:
        base_url = base_url.replace("127.0.0.1", "localhost")

    preference_data = {
        "items": [
            {
                "id": "paquete_5_archivos",
                "title": "Paquete 5 Archivos - AudioBox",
                "description": "5 conversiones de documento a audio",
                "quantity": 1,
                "currency_id": "MXN",
                "unit_price": 89.0
            }
        ],
        "payer": {
            "email": user_email,
        },
        "back_urls": {
            "success": f"{base_url}/api/payment/success?uid={user_id}",
            "failure": f"{base_url}/",
            "pending": f"{base_url}/"
        },
        "external_reference": user_id
    }

    try:
        preference_response = mp_sdk.preference().create(preference_data)
        print("MP API Response:", preference_response)
        
        if preference_response["status"] not in [200, 201]:
            error_msg = preference_response.get("response", {}).get("message", "Error desconocido")
            return jsonify({"error": f"Error de Mercado Pago: {error_msg}"}), 400
            
        preference = preference_response["response"]
        
        # In production, use init_point instead of sandbox_init_point if using real money
        checkout_url = preference.get("sandbox_init_point") if "TEST" in MP_ACCESS_TOKEN else preference.get("init_point")
        return jsonify({"url": checkout_url})
    except Exception as e:
        print("MP Exception:", e)
        return jsonify({"error": f"Error interno: {str(e)}"}), 500

@app.route('/api/payment/success', methods=['GET'])
def payment_success():
    # This route is hit when Mercado Pago redirects the user back upon successful payment
    user_id = request.args.get("uid")
    payment_status = request.args.get("status")
    
    if payment_status == "approved" and user_id:
        try:
            # Get current files
            profile_res = supabase.table("profiles").select("archivos_disponibles").eq("id", user_id).execute()
            if profile_res.data:
                current_files = profile_res.data[0].get("archivos_disponibles", 0)
                # Add 5 files
                supabase.table("profiles").update({"archivos_disponibles": current_files + 5}).eq("id", user_id).execute()
        except Exception as e:
            print("Error updating profile after payment:", e)
            
    # Redirect back to home
    return "<script>window.location.href = '/';</script>"

if __name__ == '__main__':
    # Run locally on port 5000
    app.run(debug=True, port=5000)
