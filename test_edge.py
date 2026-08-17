import asyncio
import edge_tts
import time

async def main():
    start = time.time()
    communicate = edge_tts.Communicate('Hola, esta es una prueba de voz con calidad de audiolibro.', 'es-MX-DaliaNeural')
    await communicate.save('test_edge.mp3')
    print(f"Time taken: {time.time() - start} seconds")

asyncio.run(main())
