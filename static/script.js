document.addEventListener('DOMContentLoaded', async () => {
    // -------------------------------------------------------------
    // Registrar Visita (Contador)
    // -------------------------------------------------------------
    try {
        const visitRes = await fetch('/api/visit', { method: 'POST' });
        if (visitRes.ok) {
            const visitData = await visitRes.json();
            const counterElement = document.getElementById('visit-count');
            if (counterElement && visitData.visits) {
                counterElement.textContent = visitData.visits;
            }
        }
    } catch (e) {
        console.error("Error al registrar visita:", e);
    }

    // Supabase Auth Integration
    let supabase = null;
    let currentUser = null;
    let currentUserSessionToken = null;

    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
            supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            
            // Check initial session
            const { data: { session } } = await supabase.auth.getSession();
            handleAuthChange(session);

            // Listen for auth changes
            supabase.auth.onAuthStateChange((event, session) => {
                handleAuthChange(session);
            });
        }
    } catch (e) {
        console.error("Error loading config:", e);
    }

    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const btnLogin = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');
    const btnCloseAuth = document.getElementById('btn-close-auth-modal');
    const userInfo = document.getElementById('user-info');
    const userEmail = document.getElementById('user-email');
    const userFilesCount = document.getElementById('user-files-count');
    const authError = document.getElementById('auth-error');
    const authToggleLink = document.getElementById('auth-toggle-link');
    const authTitle = document.getElementById('auth-title');
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    const authEmailInput = document.getElementById('auth-email');
    const authPasswordInput = document.getElementById('auth-password');
    let isLoginMode = true;

    async function handleAuthChange(session) {
        if (session && session.user) {
            currentUser = session.user;
            currentUserSessionToken = session.access_token;
            userEmail.textContent = currentUser.email;
            btnLogin.classList.add('hidden');
            userInfo.classList.remove('hidden');
            authModal.classList.add('hidden');
            
            // Fetch profile data
            const { data, error } = await supabase
                .from('profiles')
                .select('archivos_disponibles')
                .eq('id', currentUser.id)
                .single();
            
            if (data) {
                userFilesCount.textContent = data.archivos_disponibles;
            }
        } else {
            currentUser = null;
            currentUserSessionToken = null;
            btnLogin.classList.remove('hidden');
            userInfo.classList.add('hidden');
        }
    }

    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            authError.classList.add('hidden');
            authModal.classList.remove('hidden');
        });
    }

    if (btnCloseAuth) {
        btnCloseAuth.addEventListener('click', () => {
            authModal.classList.add('hidden');
        });
    }

    if (authToggleLink) {
        authToggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            authError.classList.add('hidden');
            if (isLoginMode) {
                authTitle.textContent = "Iniciar Sesión";
                btnAuthSubmit.textContent = "Entrar";
                document.getElementById('auth-toggle-text').textContent = "¿No tienes cuenta?";
                authToggleLink.textContent = "Regístrate";
            } else {
                authTitle.textContent = "Crear Cuenta";
                btnAuthSubmit.textContent = "Registrarse";
                document.getElementById('auth-toggle-text').textContent = "¿Ya tienes cuenta?";
                authToggleLink.textContent = "Inicia Sesión";
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            authError.classList.add('hidden');
            const email = authEmailInput.value;
            const password = authPasswordInput.value;
            btnAuthSubmit.disabled = true;
            btnAuthSubmit.textContent = "...";

            try {
                if (isLoginMode) {
                    const { error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                } else {
                    const { error } = await supabase.auth.signUp({ email, password });
                    if (error) throw error;
                    alert("Registro exitoso. Revisa tu correo (si requieres confirmación) o inicia sesión.");
                    isLoginMode = true; // Switch back to login
                    authTitle.textContent = "Iniciar Sesión";
                    btnAuthSubmit.textContent = "Entrar";
                    document.getElementById('auth-toggle-text').textContent = "¿No tienes cuenta?";
                    authToggleLink.textContent = "Regístrate";
                }
            } catch (err) {
                authError.textContent = err.message;
                authError.classList.remove('hidden');
            } finally {
                btnAuthSubmit.disabled = false;
                btnAuthSubmit.textContent = isLoginMode ? "Entrar" : "Registrarse";
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (supabase) {
                await supabase.auth.signOut();
            }
        });
    }

    const textInput = document.getElementById('text-input');
    const charCount = document.getElementById('char-count');
    const voiceSelect = document.getElementById('voice-select');
    const rateSlider = document.getElementById('rate-slider');
    const rateValue = document.getElementById('rate-value');
    const pitchSlider = document.getElementById('pitch-slider');
    const pitchValue = document.getElementById('pitch-value');
    
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    const btnResume = document.getElementById('btn-resume');
    const btnStop = document.getElementById('btn-stop');
    
    const statusText = document.getElementById('status-text');
    const pulseRing = document.querySelector('.pulse-ring');

    const synth = window.speechSynthesis;
    let voices = [];

    // i18n Translations
    const translations = {
        es: {
            title: "AudioBox",
            subtitle: "Transforma palabras escritas en voz y convierte texto en audio.",
            chars: "caracteres",
            voiceLabel: "Voz",
            loadingVoices: "Cargando voces...",
            speedLabel: "Velocidad",
            pitchLabel: "Tono",
            btnSpeak: "Hablar (Local)",
            btnPause: "Pausar",
            btnResume: "Reanudar",
            btnStop: "Detener",
            btnUpload: "Subir Documento",
            btnGenerate: "Generar Audio",
            btnCancel: "Cancelar",
            statusReady: "Listo",
            statusSpeaking: "Hablando...",
            statusPaused: "Pausado",
            statusError: "Error al reproducir audio",
            placeholder: "Escribe o pega tu texto aquí para convertirlo en voz..."
        },
        en: {
            title: "AudioBox",
            subtitle: "Transform written words into speech and convert text to audio.",
            chars: "characters",
            voiceLabel: "Voice",
            loadingVoices: "Loading voices...",
            speedLabel: "Speed",
            pitchLabel: "Pitch",
            btnSpeak: "Speak (Local)",
            btnPause: "Pause",
            btnResume: "Resume",
            btnStop: "Stop",
            btnUpload: "Upload Document",
            btnGenerate: "Generate Audio",
            btnCancel: "Cancel",
            statusReady: "Ready",
            statusSpeaking: "Speaking...",
            statusPaused: "Paused",
            statusError: "Error playing audio",
            placeholder: "Type or paste your text here to be converted to speech..."
        },
        fr: {
            title: "AudioBox",
            subtitle: "Transforme les mots écrits en parole et convertit le texte en audio.",
            chars: "caractères",
            voiceLabel: "Voix",
            loadingVoices: "Chargement des voix...",
            speedLabel: "Vitesse",
            pitchLabel: "Tonalité",
            btnSpeak: "Parler (Local)",
            btnPause: "Pause",
            btnResume: "Reprendre",
            btnStop: "Arrêter",
            btnUpload: "Uploader Document",
            btnGenerate: "Générer l'Audio",
            btnCancel: "Annuler",
            statusReady: "Prêt",
            statusSpeaking: "En cours de lecture...",
            statusPaused: "En pause",
            statusError: "Erreur de lecture audio",
            placeholder: "Tapez ou collez votre texte ici pour le convertir en voix..."
        },
        zh: {
            title: "AudioBox",
            subtitle: "将书面文字转化为语音，并将文本转换为音频。",
            chars: "字符",
            voiceLabel: "声音",
            loadingVoices: "加载声音中...",
            speedLabel: "速度",
            pitchLabel: "音调",
            btnSpeak: "朗读 (本地)",
            btnPause: "暂停",
            btnResume: "继续",
            btnStop: "停止",
            btnUpload: "上传文档",
            btnGenerate: "生成音频",
            btnCancel: "取消",
            statusReady: "准备就绪",
            statusSpeaking: "朗读中...",
            statusPaused: "已暂停",
            statusError: "播放音频时出错",
            placeholder: "在此输入或粘贴您的文本以转换为语音..."
        },
        pt: {
            title: "AudioBox",
            subtitle: "Transforma palavras escritas em voz e converte texto em áudio.",
            chars: "caracteres",
            voiceLabel: "Voz",
            loadingVoices: "Carregando vozes...",
            speedLabel: "Velocidade",
            pitchLabel: "Tom",
            btnSpeak: "Falar (Local)",
            btnPause: "Pausar",
            btnResume: "Retomar",
            btnStop: "Parar",
            btnUpload: "Subir Documento",
            btnGenerate: "Gerar Áudio",
            btnCancel: "Cancelar",
            statusReady: "Pronto",
            statusSpeaking: "Falando...",
            statusPaused: "Pausado",
            statusError: "Erro ao reproduzir áudio",
            placeholder: "Digite ou cole seu texto aqui para ser convertido em fala..."
        }
    };

    const uiLangSelect = document.getElementById('ui-lang-select');
    let currentLang = 'es';

    uiLangSelect.addEventListener('change', (e) => {
        currentLang = e.target.value;
        const dict = translations[currentLang];
        
        // Update document lang
        document.documentElement.lang = currentLang;

        // Update all data-i18n elements
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                el.textContent = dict[key];
            }
        });

        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key]) {
                el.placeholder = dict[key];
            }
        });
        
        // Update current status text
        if (!synth.speaking) {
            statusText.textContent = dict.statusReady;
        } else if (synth.paused) {
            statusText.textContent = dict.statusPaused;
        } else {
            statusText.textContent = dict.statusSpeaking;
        }
    });

    // Character counter
    textInput.addEventListener('input', () => {
        charCount.textContent = textInput.value.length;
    });

    // Load voices
    function populateVoiceList() {
        voices = synth.getVoices();
        
        // Sometimes the voices array is empty on initial load in some browsers
        if (voices.length === 0) return;

        voiceSelect.innerHTML = '';
        
        // Group voices by language code
        const voicesByLang = voices.reduce((acc, voice) => {
            const lang = voice.lang || 'Unknown';
            if (!acc[lang]) acc[lang] = [];
            acc[lang].push(voice);
            return acc;
        }, {});

        // Sort languages alphabetically
        const sortedLangs = Object.keys(voicesByLang).sort();

        sortedLangs.forEach(lang => {
            const optgroup = document.createElement('optgroup');
            // Format language label (e.g., "en-US", "es-ES", "zh-CN")
            optgroup.label = `Language: ${lang.toUpperCase()}`;
            
            voicesByLang[lang].forEach(voice => {
                const option = document.createElement('option');
                option.textContent = voice.name;
                
                if (voice.default) {
                    option.textContent += ' (Default)';
                }
                
                option.setAttribute('data-lang', voice.lang);
                option.setAttribute('data-name', voice.name);
                optgroup.appendChild(option);
            });
            
            voiceSelect.appendChild(optgroup);
        });
        
        // Select a good default voice if available (e.g. Google or default OS voice)
        const defaultVoiceIndex = voices.findIndex(v => v.default || v.name.includes('Google'));
        if (defaultVoiceIndex !== -1) {
            voiceSelect.selectedIndex = defaultVoiceIndex;
        }
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    // Update slider values
    rateSlider.addEventListener('input', () => {
        rateValue.textContent = rateSlider.value + 'x';
    });

    pitchSlider.addEventListener('input', () => {
        pitchValue.textContent = pitchSlider.value;
    });

    // Play action
    btnPlay.addEventListener('click', () => {
        if (synth.speaking) {
            console.error('speechSynthesis.speaking');
            return;
        }
        
        if (textInput.value !== '') {
            const utterThis = new SpeechSynthesisUtterance(textInput.value);
            
            const selectedOption = voiceSelect.selectedOptions[0].getAttribute('data-name');
            for (let i = 0; i < voices.length; i++) {
                if (voices[i].name === selectedOption) {
                    utterThis.voice = voices[i];
                    break;
                }
            }
            
            utterThis.pitch = pitchSlider.value;
            utterThis.rate = rateSlider.value;
            
            // Events
            utterThis.onstart = () => {
                updateUIState('playing');
            };
            
            utterThis.onend = () => {
                updateUIState('stopped');
            };
            
            utterThis.onerror = (event) => {
                console.error('SpeechSynthesisUtterance.onerror', event);
                updateUIState('stopped');
                statusText.textContent = translations[currentLang].statusError;
            };
            
            synth.speak(utterThis);
        } else {
            // Flash input to indicate it's empty
            textInput.style.borderColor = 'var(--danger)';
            setTimeout(() => {
                textInput.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }, 500);
        }
    });

    // Pause action
    btnPause.addEventListener('click', () => {
        if (synth.speaking && !synth.paused) {
            synth.pause();
            updateUIState('paused');
        }
    });

    // Resume action
    btnResume.addEventListener('click', () => {
        if (synth.paused) {
            synth.resume();
            updateUIState('playing');
        }
    });

    // Stop action
    btnStop.addEventListener('click', () => {
        if (synth.speaking) {
            synth.cancel();
            updateUIState('stopped');
        }
    });

    // UI State Manager
    function updateUIState(state) {
        // Reset button visibility
        btnPlay.classList.add('hidden');
        btnPause.classList.add('hidden');
        btnResume.classList.add('hidden');
        btnStop.classList.add('hidden');
        
        // Reset indicator
        pulseRing.className = 'pulse-ring';
        
        switch (state) {
            case 'playing':
                btnPause.classList.remove('hidden');
                btnStop.classList.remove('hidden');
                pulseRing.classList.add('playing');
                statusText.textContent = translations[currentLang].statusSpeaking;
                break;
            case 'paused':
                btnResume.classList.remove('hidden');
                btnStop.classList.remove('hidden');
                pulseRing.classList.add('paused');
                statusText.textContent = translations[currentLang].statusPaused;
                break;
            case 'stopped':
            default:
                btnPlay.classList.remove('hidden');
                statusText.textContent = translations[currentLang].statusReady;
                break;
        }
    }
    
    // Clean up on page reload/close
    window.addEventListener('beforeunload', () => {
        if (synth.speaking) {
            synth.cancel();
        }
    });

    // File Upload Logic
    const btnUpload = document.getElementById('btn-upload');
    const fileUpload = document.getElementById('file-upload');
    const btnNewFile = document.getElementById('btn-new-file');
    const btnDownloadTxt = document.getElementById('btn-download-txt');
    const btnFormatText = document.getElementById('btn-format-text');
    let currentTxtFilename = 'documento_formateado.txt';

    function updateTxtDownloadVisibility() {
        if (btnDownloadTxt) {
            if (textInput.value.trim().length > 0) {
                btnDownloadTxt.classList.remove('hidden');
            } else {
                btnDownloadTxt.classList.add('hidden');
            }
        }
    }

    if (fileUpload) {
        // Reset file input value on click so selecting the same file triggers 'change' event
        fileUpload.addEventListener('click', () => {
            fileUpload.value = '';
        });

        if (btnUpload) {
            btnUpload.addEventListener('click', () => {
                fileUpload.value = '';
                fileUpload.click();
            });
        }

        if (btnNewFile) {
            btnNewFile.addEventListener('click', () => {
                textInput.value = '';
                charCount.textContent = '0';
                fileUpload.value = '';
                updateTxtDownloadVisibility();
                fileUpload.click();
            });
        }

        textInput.addEventListener('input', updateTxtDownloadVisibility);

        if (btnDownloadTxt) {
            btnDownloadTxt.addEventListener('click', () => {
                const text = textInput.value;
                if (!text.trim()) return;
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = currentTxtFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        }

        if (btnFormatText) {
            btnFormatText.addEventListener('click', async () => {
                const text = textInput.value;
                if (!text.trim()) return;
                
                const originalContent = btnFormatText.innerHTML;
                btnFormatText.innerHTML = `<i class="ph-fill ph-spinner ph-spin"></i> Formateando...`;
                btnFormatText.disabled = true;
                
                try {
                    const formData = new FormData();
                    formData.append('text', text);
                    const res = await fetch('/api/format', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (data.text) {
                        textInput.value = data.text;
                        charCount.textContent = textInput.value.length;
                        updateTxtDownloadVisibility();
                    }
                } catch (e) {
                    console.error("Error formatting text:", e);
                } finally {
                    btnFormatText.innerHTML = originalContent;
                    btnFormatText.disabled = false;
                }
            });
        }

        fileUpload.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const currentCountStr = document.getElementById('user-files-count').textContent;
            if (currentCountStr !== '...' && parseInt(currentCountStr) <= 0) {
                // Out of credits
                fileUpload.value = '';
                document.getElementById('credits-modal').classList.remove('hidden');
                return;
            }

            const originalUploadHtml = btnUpload ? btnUpload.innerHTML : '';
            const originalNewHtml = btnNewFile ? btnNewFile.innerHTML : '';

            if (btnUpload) {
                btnUpload.innerHTML = `<i class="ph-fill ph-spinner ph-spin"></i><span>Procesando...</span>`;
                btnUpload.disabled = true;
            }
            if (btnNewFile) {
                btnNewFile.innerHTML = `<i class="ph-fill ph-spinner ph-spin"></i><span>Procesando...</span>`;
                btnNewFile.disabled = true;
            }
            
            const progressContainer = document.getElementById('upload-progress-container');
            const progressBar = document.getElementById('upload-progress-bar');
            const progressText = document.getElementById('upload-progress-text');
            const errorText = document.getElementById('upload-error-text');
            
            if (progressContainer) {
                progressContainer.classList.remove('hidden');
                progressBar.style.width = '10%';
                progressBar.style.background = 'var(--primary)';
                progressText.textContent = `Leyendo ${file.name}...`;
                if (errorText) errorText.classList.add('hidden');
            }

            function restoreButtons() {
                if (btnUpload) {
                    btnUpload.innerHTML = originalUploadHtml;
                    btnUpload.disabled = false;
                }
                if (btnNewFile) {
                    btnNewFile.innerHTML = originalNewHtml;
                    btnNewFile.disabled = false;
                }
                fileUpload.value = '';
            }

            function showUploadError(msg) {
                restoreButtons();
                if (progressContainer && errorText) {
                    progressBar.style.width = '0%';
                    progressBar.style.background = 'var(--danger)';
                    progressText.textContent = 'Error';
                    errorText.textContent = msg;
                    errorText.classList.remove('hidden');
                    setTimeout(() => {
                        progressBar.style.background = 'var(--primary)';
                        progressContainer.classList.add('hidden');
                    }, 6000);
                } else {
                    alert(msg);
                }
            }
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                
                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable && progressContainer) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        progressBar.style.width = percent + '%';
                        if (percent >= 100) {
                            progressText.textContent = `Archivo enviado. Extrayendo y formateando texto...`;
                        } else {
                            progressText.textContent = `Subiendo documento... ${percent}%`;
                        }
                    }
                });
                
                xhr.addEventListener('load', () => {
                    restoreButtons();
                    
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            if (data.error) throw new Error(data.error);
                            
                            textInput.value = data.text;
                            charCount.textContent = textInput.value.length;
                            if (data.filename) {
                                currentTxtFilename = data.filename;
                            }
                            updateTxtDownloadVisibility();
                            
                            if (btnNewFile) {
                                btnNewFile.classList.remove('hidden');
                            }
                            
                            if (progressContainer) {
                                progressBar.style.width = '100%';
                                progressText.textContent = '¡Documento cargado y formateado con éxito!';
                                setTimeout(() => progressContainer.classList.add('hidden'), 2500);
                            }
                        } catch (e) {
                            showUploadError(e.message || "Error al leer la respuesta del servidor.");
                        }
                    } else if (xhr.status === 413) {
                        showUploadError("El archivo supera el límite permitido de 16MB.");
                    } else {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            showUploadError(data.error || "Error al extraer texto del archivo.");
                        } catch (e) {
                            showUploadError("No se pudo procesar el archivo. " + xhr.statusText);
                        }
                    }
                });
                
                xhr.addEventListener('error', () => {
                    showUploadError("Error de conexión al servidor.");
                });
                
                xhr.open('POST', '/api/extract', true);
                if (currentUserSessionToken) {
                    xhr.setRequestHeader('Authorization', 'Bearer ' + currentUserSessionToken);
                } else {
                    showUploadError("Debes iniciar sesión para subir archivos.");
                    return;
                }
                xhr.send(formData);
                
            } catch (err) {
                console.error(err);
                showUploadError("Error inesperado al subir el archivo.");
            }
        });
    }

    // Backend Audio Generation Logic
    const btnGenerate = document.getElementById('btn-generate-audio');
    const btnCancelAudio = document.getElementById('btn-cancel-audio');
    const formatModal = document.getElementById('format-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const formatBtns = document.querySelectorAll('.format-btn');
    
    let currentTaskId = null;
    let isCancelled = false;
    
    if (btnCancelAudio) {
        btnCancelAudio.addEventListener('click', async () => {
            if (currentTaskId) {
                isCancelled = true;
                await fetch(`/api/cancel/${currentTaskId}`, { method: 'POST' });
                statusText.textContent = currentLang === 'es' ? 'Cancelado' : 'Cancelled';
            }
        });
    }
    
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            if (formatModal) formatModal.classList.add('hidden');
        });
    }
    
    if (formatBtns) {
        formatBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                if (formatModal) formatModal.classList.add('hidden');
                const format = btn.getAttribute('data-format');
                await generateAudio(format);
            });
        });
    }
    
    if (btnGenerate) {
        btnGenerate.addEventListener('click', () => {
            const text = textInput.value.trim();
            if (!text) {
                textInput.style.borderColor = 'var(--danger)';
                setTimeout(() => {
                    textInput.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }, 500);
                return;
            }
            if (formatModal) formatModal.classList.remove('hidden');
        });
    }
    
    async function generateAudio(format) {
        const text = textInput.value.trim();
        if (!text) return;

        // UI Loading state
        btnGenerate.disabled = true;
        btnGenerate.style.display = 'none';
        if (btnCancelAudio) {
            btnCancelAudio.classList.remove('hidden');
            btnCancelAudio.style.display = 'flex';
        }
        
        pulseRing.className = 'pulse-ring playing';
        statusText.textContent = translations[currentLang].statusSpeaking; // Reuse speaking state as loading
        statusText.style.color = 'var(--success)';

        try {
            isCancelled = false;
            currentTaskId = null;
            const formData = new FormData();
            formData.append('text', text);
            const serverVoiceSelectEl = document.getElementById('server-voice-select');
            const selectedLang = serverVoiceSelectEl ? serverVoiceSelectEl.value : currentLang;
            formData.append('lang', selectedLang);
            formData.append('format', format);

            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            currentTaskId = data.task_id;
            
            // Polling loop
            let isCompleted = false;
            while (!isCompleted && !isCancelled) {
                await new Promise(resolve => setTimeout(resolve, 800));
                if (isCancelled) break;
                
                const statusRes = await fetch(`/api/status/${currentTaskId}`);
                const statusData = await statusRes.json();
                
                if (!statusRes.ok) throw new Error(statusData.error || "Status check failed");
                
                if (statusData.status === 'error') {
                    throw new Error(statusData.error || 'Unknown processing error');
                }
                
                if (statusData.status === 'processing') {
                    // Dynamically update UI with progress
                    let generatingText = currentLang === 'es' ? 'Generando audio...' : 'Generating audio...';
                    statusText.textContent = `${generatingText} ${statusData.progress}%`;
                } else if (statusData.status === 'cancelled') {
                    isCancelled = true;
                    break;
                } else if (statusData.status === 'completed') {
                    isCompleted = true;
                    statusText.textContent = currentLang === 'es' ? 'Descargando...' : 'Downloading...';
                    
                    // Download the file via endpoint
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = `/api/download/${currentTaskId}`;
                    a.download = `vocalize_audio.${format}`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }
            }
            
            if (isCancelled) {
                statusText.textContent = currentLang === 'es' ? 'Cancelado' : 'Cancelled';
                statusText.style.color = 'var(--text-muted)';
            } else {
                statusText.textContent = translations[currentLang].statusReady;
                statusText.style.color = 'var(--text-muted)';
            }
        } catch (error) {
            console.error("Error generating audio:", error);
            // Replace "Error de generación" with the actual error message
            let errMsg = error.message;
            if (errMsg === 'Failed to fetch') {
                errMsg = 'Error de conexión con el servidor.';
            } else if (errMsg.includes('429')) {
                errMsg = 'Demasiadas solicitudes. El texto es demasiado largo para procesarse de una vez.';
            }
            statusText.textContent = `Error: ${errMsg}`;
            statusText.style.color = 'var(--danger)';
        } finally {
            // Reset UI
            btnGenerate.disabled = false;
            btnGenerate.style.display = 'flex';
            if (btnCancelAudio) {
                btnCancelAudio.classList.add('hidden');
                btnCancelAudio.style.display = 'none';
            }
            pulseRing.className = 'pulse-ring';
            currentTaskId = null;
        }
    }
    // Credits Modal & Mercado Pago Logic
    const btnBuyCredits = document.getElementById('btn-buy-credits');
    const btnModalBuy = document.getElementById('btn-modal-buy');
    const creditsModal = document.getElementById('credits-modal');
    const creditsClose = document.getElementById('credits-close');

    if (creditsClose && creditsModal) {
        creditsClose.addEventListener('click', () => {
            creditsModal.classList.add('hidden');
        });
    }

    async function handlePurchase() {
        if (!supabase) return alert("Por favor inicia sesión primero.");
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return alert("Por favor inicia sesión primero.");

        const btn = this;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="ph-fill ph-spinner ph-spin"></i> Redirigiendo...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });
            const data = await res.json();
            
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert("Error al generar el pago: " + (data.error || "Desconocido"));
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        } catch (e) {
            console.error("Payment error:", e);
            alert("Error al procesar la solicitud de pago.");
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }

    if (btnBuyCredits) {
        btnBuyCredits.addEventListener('click', handlePurchase);
    }
    if (btnModalBuy) {
        btnModalBuy.addEventListener('click', handlePurchase);
    }
});
