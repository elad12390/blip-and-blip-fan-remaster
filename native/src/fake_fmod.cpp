#include "fmod.h"

#include <SDL2/SDL_mixer.h>
#include <cstring>

extern "C" {
struct FMUSIC_MODULE {};
struct FSOUND_STREAM {
    Mix_Music* music;
    int loop;
    void* decoder_buffer;
};
static FSOUND_STREAM* activeMusic = nullptr;
struct FSOUND_SAMPLE {
    Mix_Chunk* chunk;
    int loop;
};

typedef struct FMUSIC_MODULE FMUSIC_MODULE;
typedef struct FSOUND_STREAM FSOUND_STREAM;
typedef struct FSOUND_SAMPLE FSOUND_SAMPLE;

FSOUND_SAMPLE* FSOUND_Sample_Load(int index,
                                  const char* buffer,
                                  unsigned int mode,
                                  int memlength) {
    FSOUND_SAMPLE* sample = new FSOUND_SAMPLE;

    sample->loop = 0;
    sample->chunk = Mix_LoadWAV_RW(SDL_RWFromConstMem(buffer, memlength), 1);
    if (!sample->chunk) {
        printf("Mix_LoadWAV_RW: %s\n", Mix_GetError());
    }

    return sample;
}
int FSOUND_PlaySound(int channel, FSOUND_SAMPLE* sptr) {
    return Mix_PlayChannel(channel, sptr->chunk, sptr->loop);
}
signed char FSOUND_Sample_SetLoopMode(FSOUND_SAMPLE* sptr,
                                      unsigned int loopmode) {
    if (loopmode & FSOUND_LOOP_NORMAL) {
        sptr->loop = -1;
    } else {
        sptr->loop = 0;
    }
    return true;
}

signed char FSOUND_StopSound(int channel) {
    Mix_HaltChannel(channel);
    return true;
}

void FSOUND_Sample_Free(FSOUND_SAMPLE* sptr) {
    Mix_FreeChunk(sptr->chunk);
    delete sptr;
}

FSOUND_STREAM* FSOUND_Stream_OpenFile(const char* filename,
                                      unsigned int mode,
                                      int memlength) {
    FSOUND_STREAM* stream = new FSOUND_STREAM;
    stream->loop = (mode & FSOUND_LOOP_NORMAL) ? -1 : 0;
    stream->decoder_buffer = nullptr;
    stream->music = Mix_LoadMUS(filename);
    // These two original .zik files are MP3s with a 417-byte zero prefix.
    // SDL_mixer otherwise classifies their unknown header as a tracker module.
    // Preserve files byte-for-byte and trim only the decoder's memory view.
    const bool paddedMp3 = std::strcmp(filename, "data/gameover.zik") == 0 ||
                           std::strcmp(filename, "data/tambour.zik") == 0;
    if (!stream->music && paddedMp3) {
        size_t size = 0;
        stream->decoder_buffer = SDL_LoadFile(filename, &size);
        if (stream->decoder_buffer && size > 419) {
            auto* bytes = static_cast<unsigned char*>(stream->decoder_buffer);
            bool zeroPrefix = true;
            for (size_t i = 0; i < 417; ++i) zeroPrefix = zeroPrefix && bytes[i] == 0;
            if (zeroPrefix && bytes[417] == 0xff && (bytes[418] & 0xe0) == 0xe0) {
                SDL_RWops* source = SDL_RWFromConstMem(bytes + 417, int(size - 417));
                if (source) stream->music = Mix_LoadMUSType_RW(source, MUS_MP3, 1);
            }
        }
    }
    if (!stream->music) {
        fprintf(stderr, "Mix_LoadMUS(\"%s\"): %s\n", filename, Mix_GetError());
        SDL_free(stream->decoder_buffer);
        delete stream;
        return nullptr;
    }
    return stream;
}
int FSOUND_Stream_Play(int channel, FSOUND_STREAM* stream) {
    if (!stream || !stream->music) return false;
    if (Mix_PlayMusic(stream->music, stream->loop) != 0) {
        fprintf(stderr, "Mix_PlayMusic: %s\n", Mix_GetError());
        return false;
    }
    activeMusic = stream;
    return true;
}
signed char FSOUND_Stream_Stop(FSOUND_STREAM* stream) {
    if (stream && activeMusic == stream) {
        Mix_HaltMusic();
        activeMusic = nullptr;
    }
    return true;
}
signed char FSOUND_Stream_Close(FSOUND_STREAM* stream) {
    if (!stream) return true;
    FSOUND_Stream_Stop(stream);
    Mix_FreeMusic(stream->music);
    SDL_free(stream->decoder_buffer);
    delete stream;
    return true;
}

signed char FSOUND_Init(int mixrate,
                        int maxsoftwarechannels,
                        unsigned int flags) {
    int f = MIX_INIT_MP3 | MIX_INIT_OGG | MIX_INIT_MOD;
    int initted = Mix_Init(f);
    if ((initted & f) != f) {
        printf("Mix_Init: Failed to init required ogg and mod support!\n");
        printf("Mix_Init: %s\n", Mix_GetError());
        return 0;
    }

    if (Mix_OpenAudio(mixrate, MIX_DEFAULT_FORMAT, 2, 1024) == -1) {
        printf("Mix_OpenAudio: %s\n", Mix_GetError());
        return 0;
    }
    Mix_AllocateChannels(maxsoftwarechannels);
    return 1;
}
void FSOUND_Close() {
    Mix_CloseAudio();
    while (Mix_Init(0)) Mix_Quit();
}
int FSOUND_GetError() { return true; }
signed char FMUSIC_PlaySong(FMUSIC_MODULE* mod) { return true; }
FMUSIC_MODULE* FMUSIC_LoadSong(const char* name) { return nullptr; }
signed char FMUSIC_SetMasterVolume(FMUSIC_MODULE* mod, int volume) {
    return true;
}
signed char FMUSIC_StopSong(FMUSIC_MODULE* mod) { return true; }
signed char FMUSIC_FreeSong(FMUSIC_MODULE* mod) { return true; }
signed char FSOUND_SetPriority(int channel, int priority) { return true; }
}
