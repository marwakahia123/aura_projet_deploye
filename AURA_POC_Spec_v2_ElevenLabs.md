# AURA — POC Web App : Écoute + Wake Word + Commande Vocale + Réponse TTS

**Version** : 2.0
**Projet** : HALLIA — AURA Assistant IA Permanent
**Scope** : POC navigateur — Écoute micro continue, wake word Porcupine, STT real-time ElevenLabs, TTS ElevenLabs
**Destinataire** : Claude Code (implémentation complète)

---

## 1. Objectif du POC

Prouver le pipeline audio complet d'AURA dans un navigateur web :

1. Le micro du navigateur écoute en permanence
2. Porcupine Web détecte le wake word "Aura" (ou mot built-in en fallback)
3. Après détection, l'audio de la commande est streamé en temps réel vers ElevenLabs Scribe v2 Realtime (WebSocket)
4. La transcription apparaît en temps réel à l'écran (partial + final)
5. La transcription finale est envoyée au backend
6. Le backend envoie la transcription à un LLM (Claude) qui génère une réponse texte
7. La réponse texte est envoyée à ElevenLabs TTS (Flash v2.5) pour synthèse vocale
8. L'audio TTS est streamé et joué dans le navigateur

**Ce pipeline prouve le cycle complet : Voix utilisateur → Texte → LLM → Voix AURA**

**HORS SCOPE** : mémoire contextuelle, agent loop avec tools, actions (email, WhatsApp), authentification utilisateur, base de données.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ NAVIGATEUR (Next.js / React)                                     │
│                                                                   │
│  ┌──────────────┐     ┌───────────────────┐                     │
│  │ Web Audio API │────►│ Porcupine Web     │                     │
│  │ (micro)       │     │ Wake Word "Aura"  │                     │
│  └──────┬───────┘     └───────┬───────────┘                     │
│         │                     │ wake word détecté                 │
│         │                     ▼                                   │
│         │              ┌──────────────────────────────┐          │
│         └──────────────► WebSocket ElevenLabs          │          │
│           audio PCM    │ Scribe v2 Realtime            │          │
│           base64       │ wss://api.elevenlabs.io/v1/   │          │
│                        │   speech-to-text/realtime     │          │
│                        └──────────┬───────────────────┘          │
│                                   │ partial_transcript            │
│                                   │ committed_transcript          │
│                                   ▼                               │
│                        ┌─────────────────────┐                   │
│                        │ Affichage temps réel │                   │
│                        └─────────┬───────────┘                   │
│                                  │ texte final                    │
└──────────────────────────────────┼───────────────────────────────┘
                                   │ POST /api/chat
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│ BACKEND (FastAPI)                                                 │
│                                                                   │
│  POST /api/chat  { text: "résume la réunion" }                   │
│       │                                                           │
│       ▼                                                           │
│  ┌─────────────────┐     ┌──────────────────────────────┐       │
│  │ Claude Sonnet    │────►│ ElevenLabs TTS API           │       │
│  │ (Anthropic API)  │     │ POST /v1/text-to-speech      │       │
│  │                  │     │ Model: eleven_flash_v2_5      │       │
│  │ Réponse texte    │     │ Streaming audio chunks        │       │
│  └─────────────────┘     └──────────────┬───────────────┘       │
│                                          │ audio stream           │
└──────────────────────────────────────────┼───────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│ NAVIGATEUR                                                        │
│  ┌──────────────────┐                                             │
│  │ Web Audio API     │  ← Lecture de la réponse vocale AURA      │
│  │ Playback stream   │                                            │
│  └──────────────────┘                                             │
└──────────────────────────────────────────────────────────────────┘
```

### Pourquoi cette architecture :

- **STT côté client (browser → ElevenLabs direct)** : réduit la latence, pas de double hop via le backend. ElevenLabs fournit des tokens single-use pour sécuriser l'accès sans exposer l'API key.
- **TTS côté backend** : le backend génère la réponse LLM et enchaîne directement avec le TTS. L'audio est streamé au frontend.
- **Un seul provider audio (ElevenLabs)** : simplifie la facturation, la gestion des clés, et garantit une expérience cohérente.

---

## 3. Stack technique

### Frontend

| Composant | Choix | Version / Notes |
|-----------|-------|-----------------|
| Framework | **Next.js** (App Router) | 14+ |
| Langage | **TypeScript** | 5+ |
| Audio capture | **Web Audio API** + **AudioWorklet** | Natif navigateur |
| Wake word | **@picovoice/porcupine-web** | Dernière version |
| STT streaming | **WebSocket natif** → ElevenLabs Scribe v2 Realtime | Direct depuis le browser |
| Audio playback TTS | **Web Audio API** | Lecture des chunks audio streamés |
| Styling | **Tailwind CSS** | 3+ |
| HTTP client | **fetch** (natif) | Pour POST /api/chat |

### Backend

| Composant | Choix | Version / Notes |
|-----------|-------|-----------------|
| Framework | **FastAPI** | 0.115+ |
| Langage | **Python 3.12+** | |
| LLM | **Claude Sonnet** (Anthropic API) | `claude-sonnet-4-20250514` |
| TTS | **ElevenLabs API** (streaming) | eleven_flash_v2_5 |
| SDK ElevenLabs | **elevenlabs** Python package | Dernière version |
| SDK Anthropic | **anthropic** Python package | Dernière version |
| Token generation | **ElevenLabs single-use tokens** | Pour auth client-side STT |

---

## 4. ElevenLabs — Détails techniques

### 4.1 STT : Scribe v2 Realtime (WebSocket)

**Endpoint WebSocket** : `wss://api.elevenlabs.io/v1/speech-to-text/realtime`

**Authentification client-side** : utiliser un **single-use token** (pas l'API key directement dans le browser).

Le backend expose un endpoint pour générer ce token :

```
GET /api/stt-token → { "token": "xxxxx" }
```

Le backend appelle l'API ElevenLabs pour créer un token single-use :

```python
# Backend : génération de token
import httpx

async def create_stt_token(api_key: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.elevenlabs.io/v1/tokens",
            headers={"xi-api-key": api_key}
        )
        return response.json()["token"]
```

**Connexion WebSocket depuis le browser** :

```
wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token={token}
```

**Configuration de session** (premier message envoyé après connexion) :

```json
{
    "type": "session_config",
    "config": {
        "sample_rate": 16000,
        "audio_format": "pcm_16000",
        "language_code": "fr",
        "vad_silence_threshold_secs": 1.5,
        "vad_threshold": 0.4,
        "min_speech_duration_ms": 100,
        "model_id": "scribe_v2_realtime",
        "include_timestamps": true
    }
}
```

**Envoi d'audio** (chunks continus) :

```json
{
    "message_type": "input_audio_chunk",
    "audio_base_64": "<PCM 16-bit 16kHz en base64>",
    "sample_rate": 16000
}
```

**Réceptions** :

```json
// Transcription partielle (affichée en temps réel, grisée)
{
    "message_type": "partial_transcript",
    "text": "résume la réunion de"
}

// Transcription finale (commitée, validée)
{
    "message_type": "committed_transcript",
    "text": "Résume la réunion de tout à l'heure."
}
```

**Points critiques** :
- L'audio DOIT être en **PCM 16-bit, 16 kHz, mono**. Le navigateur capture en 44.1 kHz ou 48 kHz par défaut — il faut **downsample à 16 kHz** dans le browser via un AudioWorklet ou OfflineAudioContext.
- Envoyer les chunks toutes les **100-250ms** (pas trop petit = overhead, pas trop gros = latence).
- Le **VAD server-side** est intégré dans Scribe v2 Realtime (`vad_silence_threshold_secs`). Quand ElevenLabs détecte un silence de 1.5s, il "commit" automatiquement la transcription. Ça simplifie beaucoup — on n'a plus besoin de faire de la détection de silence côté browser pour le STT.
- Le token single-use expire après utilisation. Le frontend doit demander un nouveau token avant chaque session STT (chaque activation wake word).

### 4.2 TTS : Flash v2.5 (Streaming REST ou WebSocket)

Pour le POC, utiliser l'**API REST avec streaming** (plus simple que WebSocket TTS).

**Endpoint** : `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`

**Requête** :

```json
{
    "text": "Voici le résumé de votre réunion...",
    "model_id": "eleven_flash_v2_5",
    "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.75
    },
    "output_format": "mp3_22050_32"
}
```

**Header** : `xi-api-key: {api_key}`

**Réponse** : Stream audio (chunked transfer encoding). Les premiers bytes arrivent en ~75ms.

**Le backend FastAPI** fait l'appel TTS et streame la réponse au frontend via un `StreamingResponse`.

**Choix de la voix** : utiliser une voix ElevenLabs pré-existante qui sonne bien en français. Recommandations :
- Parcourir la voice library ElevenLabs pour trouver une voix FR naturelle
- Stocker le `voice_id` dans la config backend
- Pour le POC, utiliser une des voix par défaut (ex: "Rachel", "Adam")

### 4.3 Clé API et facturation

Un seul compte ElevenLabs, une seule clé API (`ELEVENLABS_API_KEY`) pour :
- Génération de tokens STT single-use
- Appels TTS depuis le backend

La clé API n'est JAMAIS exposée côté client. Le client utilise uniquement les tokens single-use pour le STT.

---

## 5. Frontend — Spécifications détaillées

### 5.1 Structure des fichiers

```
aura-poc/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Page principale unique
│   │   └── globals.css
│   ├── components/
│   │   ├── AuraOrb.tsx               # Orbe visuel animé (indicateur d'état)
│   │   ├── StatusBar.tsx             # Barre d'état textuelle
│   │   ├── TranscriptPanel.tsx       # Affichage des transcriptions + réponses
│   │   ├── VolumeIndicator.tsx       # Visualisation du volume micro en temps réel
│   │   └── LiveTranscript.tsx        # Texte qui s'écrit en temps réel (partial STT)
│   ├── hooks/
│   │   ├── useAudioCapture.ts        # Hook : capture micro + volume + downsampling 16kHz
│   │   ├── usePorcupine.ts           # Hook : wake word detection
│   │   ├── useElevenLabsSTT.ts       # Hook : WebSocket STT real-time
│   │   ├── useAudioPlayer.ts         # Hook : lecture audio TTS streamé
│   │   └── useAuraSession.ts         # Hook : orchestration du flow complet
│   ├── lib/
│   │   ├── api.ts                    # Appels backend (token, chat, tts)
│   │   ├── audioUtils.ts             # Downsampling, conversion PCM, base64
│   │   ├── pcmProcessor.worklet.ts   # AudioWorklet pour downsampling temps réel
│   │   └── constants.ts              # Constantes
│   ├── public/
│   │   └── porcupine/                # Fichiers modèle Porcupine
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
```

### 5.2 États de l'application

```typescript
type AppState =
  | "initializing"   // Chargement Porcupine + accès micro
  | "idle"           // Écoute passive — attente du wake word
  | "listening"      // Wake word détecté — STT real-time actif, commande en cours
  | "thinking"       // Commande envoyée au LLM, en attente de réponse
  | "speaking"       // AURA parle — lecture TTS en cours
  | "error"          // Erreur
```

Machine à états :

```
initializing ──(micro OK + Porcupine chargé)──► idle
initializing ──(erreur)──► error

idle ──(wake word détecté)──► listening

listening ──(committed_transcript reçu, silence VAD ElevenLabs)──► thinking
listening ──(utilisateur clique stop)──► thinking
listening ──(timeout 30s)──► thinking

thinking ──(réponse LLM reçue, TTS commence)──► speaking
thinking ──(erreur)──► idle

speaking ──(audio TTS terminé)──► idle
speaking ──(wake word détecté = interruption)──► listening

error ──(retry)──► initializing
```

**Note importante : l'interruption.** Si l'utilisateur dit "Aura" pendant que le TTS joue (état `speaking`), AURA doit s'arrêter de parler et écouter la nouvelle commande. Porcupine reste actif pendant le TTS. Quand le wake word est détecté en état `speaking` : stopper la lecture audio TTS, fermer le stream TTS, et passer en `listening`.

### 5.3 Hook useAudioCapture.ts

```typescript
interface UseAudioCaptureReturn {
    stream: MediaStream | null;
    audioContext: AudioContext | null;
    volume: number;                     // 0-100 pour visualisation
    isActive: boolean;
    error: string | null;
    // Méthode pour obtenir les chunks PCM 16kHz
    onPCMChunk: (callback: (chunk: Float32Array) => void) => void;
    requestMicAccess: () => Promise<void>;
    stopMic: () => void;
}
```

**Downsampling à 16 kHz** — C'est le point technique le plus délicat côté frontend.

Le navigateur capture l'audio en 44100 Hz ou 48000 Hz. ElevenLabs STT attend du PCM 16000 Hz. Il faut downsampler en temps réel.

**Approche recommandée : AudioWorklet.**

Créer un `pcmProcessor.worklet.ts` qui :
1. Reçoit les samples audio du micro (44.1 ou 48 kHz)
2. Downsample à 16 kHz par interpolation linéaire
3. Convertit en Int16 (PCM 16-bit)
4. Envoie les chunks via `port.postMessage()`

```typescript
// pcmProcessor.worklet.ts (simplifié)
class PCMProcessor extends AudioWorkletProcessor {
    // Resample depuis sampleRate natif vers 16000 Hz
    // Buffer de 4096 samples → produit un chunk de ~1460 samples en 16kHz
    // Convertir Float32 [-1,1] en Int16 [-32768, 32767]
    // Poster le chunk toutes les ~250ms
    
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
        const input = inputs[0][0]; // Mono, premier canal
        if (!input) return true;
        
        // ... downsampling + buffering + envoi toutes les 250ms
        
        return true; // Continuer le processing
    }
}

registerProcessor('pcm-processor', PCMProcessor);
```

**Alternative plus simple** (si AudioWorklet pose des problèmes) : utiliser un `ScriptProcessorNode` (deprecated mais fonctionne encore partout) pour le downsampling. Moins performant mais OK pour un POC.

### 5.4 Hook useElevenLabsSTT.ts

```typescript
interface UseElevenLabsSTTReturn {
    isConnected: boolean;
    isTranscribing: boolean;
    partialText: string;           // Transcription partielle (en cours)
    committedText: string;         // Transcription finale (commise)
    error: string | null;
    connect: () => Promise<void>;  // Ouvrir la connexion WebSocket
    sendAudioChunk: (pcmData: Int16Array) => void;  // Envoyer un chunk audio
    disconnect: () => void;        // Fermer la connexion
}
```

**Flow interne du hook :**

1. `connect()` est appelé quand le wake word est détecté
2. Le hook appelle le backend `GET /api/stt-token` pour obtenir un token single-use
3. Il ouvre un WebSocket vers `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token={token}`
4. Il attend le message `session_started` de confirmation
5. `sendAudioChunk()` est appelé pour chaque chunk PCM 16kHz du micro
6. Les chunks sont convertis en base64 et envoyés comme `input_audio_chunk`
7. Les `partial_transcript` mettent à jour `partialText` (affiché en gris, s'écrit en temps réel)
8. Le `committed_transcript` met à jour `committedText` (texte final validé)
9. Quand `committed_transcript` est reçu → déclencher l'envoi au backend LLM
10. `disconnect()` ferme le WebSocket proprement

**Conversion PCM Int16 → base64 :**

```typescript
function int16ToBase64(pcmData: Int16Array): string {
    const bytes = new Uint8Array(pcmData.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
```

**Gestion du multi-commits :** Si l'utilisateur fait une pause puis reprend (ex: "résume la réunion... [pause 1.5s]... et envoie-moi ça par mail"), Scribe va produire deux `committed_transcript` séparés. Il faut les **accumuler** jusqu'à un silence plus long (ex: 3 secondes sans nouvelle parole) ou un timeout pour considérer que la commande est complète.

Stratégie :
- Accumuler tous les `committed_transcript` 
- Après le dernier `committed_transcript`, démarrer un timer de 2 secondes
- Si pas de nouveau `partial_transcript` pendant ces 2 secondes → la commande est complète
- Concaténer tous les commits → c'est la commande finale
- Envoyer au backend

### 5.5 Hook useAudioPlayer.ts

```typescript
interface UseAudioPlayerReturn {
    isPlaying: boolean;
    play: (audioStream: ReadableStream<Uint8Array>) => Promise<void>;
    stop: () => void;   // Arrêter la lecture (interruption)
}
```

**Le backend streame l'audio TTS.** Le frontend le reçoit et le joue au fur et à mesure.

Pour lire un stream audio MP3 :
- Utiliser **MediaSource Extensions (MSE)** avec un `<audio>` element
- Ou décoder les chunks MP3 avec `AudioContext.decodeAudioData()` et les jouer via `AudioBufferSourceNode`
- L'approche MSE est plus propre pour du streaming

**Alternative plus simple pour le POC :** si le streaming est complexe à implémenter, accepter un compromis : attendre la réponse TTS complète (pas streaming), puis jouer le fichier MP3 complet. La latence sera plus élevée (~1-2s au lieu de ~200ms) mais c'est fonctionnel. Le streaming pourra être ajouté en V2.

### 5.6 Hook useAuraSession.ts — Orchestration

Ce hook orchestre tout le flow. C'est le "chef d'orchestre" qui coordonne les autres hooks.

```typescript
interface UseAuraSessionReturn {
    state: AppState;
    currentTranscript: string;     // Partial pendant l'écoute
    lastCommand: string;           // Dernier committed transcript
    lastResponse: string;          // Dernière réponse LLM
    history: ConversationEntry[];  // Historique commandes + réponses
}

interface ConversationEntry {
    id: string;
    timestamp: Date;
    command: string;               // Ce que l'utilisateur a dit
    response: string;              // Ce qu'AURA a répondu
}
```

**Flow orchestré :**

```
1. IDLE
   - Porcupine écoute le wake word
   - VolumeIndicator affiche le volume micro

2. WAKE WORD DÉTECTÉ
   → Jouer son de confirmation
   → Demander un token STT au backend
   → Ouvrir WebSocket ElevenLabs STT
   → Passer en LISTENING
   → Commencer à envoyer les chunks audio PCM 16kHz

3. LISTENING
   - Afficher partialText en temps réel (LiveTranscript component)
   - Accumuler les committed_transcript
   - Timer de 2s après dernier commit → commande complète
   - OU timeout 30s → forcer fin
   - OU bouton stop → forcer fin

4. COMMANDE COMPLÈTE
   → Fermer WebSocket STT
   → Passer en THINKING
   → POST /api/chat { text: commandeComplète }
   → Attendre réponse (stream)

5. RÉPONSE LLM REÇUE
   → Passer en SPEAKING
   → Jouer l'audio TTS streamé
   → Afficher la réponse texte dans le TranscriptPanel
   
6. TTS TERMINÉ
   → Passer en IDLE
   → Porcupine reprend l'écoute

INTERRUPTION (à tout moment en SPEAKING) :
   → Porcupine détecte le wake word
   → Stopper la lecture TTS
   → Reprendre à l'étape 2
```

### 5.7 Composant LiveTranscript.tsx

Nouveau composant qui affiche la transcription qui s'écrit en temps réel.

```
Pendant l'état LISTENING :

┌──────────────────────────────────────────┐
│                                           │
│   "Résume la réunion de tout à l'h..."   │  ← texte qui s'écrit lettre par lettre
│   █                                       │  ← curseur clignotant
│                                           │
└──────────────────────────────────────────┘
```

- Le `partialText` est affiché en blanc/gris clair
- Quand un `committedText` arrive, il remplace la partie partielle correspondante en blanc vif
- Effet de typing animé (le texte apparaît progressivement)
- Curseur clignotant à la fin

### 5.8 Interface utilisateur mise à jour

```
┌───────────────────────────────────────────────────────┐
│                      AURA POC                          │
│                  Mot-clé : « Aura »                    │
│                                                        │
│                    ┌─────────┐                         │
│                    │         │                         │
│                    │  ORB    │                         │
│                    │         │                         │
│                    └─────────┘                         │
│                                                        │
│              "Dites « Aura » pour commencer"           │
│              ░░░░░░░░░░░░░░░░░░  ← volume             │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  "Résume la réunion de tout à l'heure█"          │  │
│  │  ← transcription temps réel (en cours d'écoute)  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Historique :                                      │  │
│  │                                                   │  │
│  │ 🗣 14:32 — "Résume la réunion de tout à l'heure" │  │
│  │ 🤖 14:32 — "Voici le résumé de votre réunion..." │  │
│  │                                                   │  │
│  │ 🗣 14:28 — "Quel était le prix annoncé ?"        │  │
│  │ 🤖 14:28 — "D'après nos échanges, le prix..."    │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

### 5.9 Composant AuraOrb.tsx — États mis à jour

| État | Couleur | Animation |
|------|---------|-----------|
| initializing | Gris | Pulse lent |
| idle | Bleu foncé (`#3b82f6`) | Respiration lente (scale 1.0 → 1.03, 4s) |
| listening | Vert vif (`#22c55e`) | Pulse réactif au volume + glow intensifié |
| thinking | Amber (`#f59e0b`) | Rotation d'un anneau externe |
| speaking | Violet (`#8b5cf6`) | Pulse au rythme de l'audio TTS (si possible, sinon pulse régulier) |
| error | Rouge (`#ef4444`) | Fixe |

**Nouveau : état `speaking` en violet** pour distinguer clairement quand AURA parle vs quand elle écoute.

### 5.10 Variables d'environnement frontend

```env
# .env.local
NEXT_PUBLIC_PORCUPINE_ACCESS_KEY=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Pas de clé ElevenLabs côté frontend — le token est obtenu via le backend.

---

## 6. Backend — Spécifications détaillées

### 6.1 Structure des fichiers

```
aura-poc/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app + CORS
│   │   ├── config.py                 # Settings (env vars)
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py             # GET /health
│   │       ├── stt_token.py          # GET /api/stt-token
│   │       └── chat.py               # POST /api/chat (LLM + TTS)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env
```

### 6.2 Endpoint GET /api/stt-token

Génère un token ElevenLabs single-use pour le STT client-side.

```python
from fastapi import APIRouter
import httpx
from app.config import settings

router = APIRouter()

@router.get("/api/stt-token")
async def get_stt_token():
    """
    Génère un token single-use ElevenLabs pour l'authentification
    WebSocket STT côté client.
    Le token expire après une utilisation.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.elevenlabs.io/v1/tokens",
            headers={"xi-api-key": settings.ELEVENLABS_API_KEY}
        )
        response.raise_for_status()
        token = response.json()["token"]
    
    return {"token": token}
```

### 6.3 Endpoint POST /api/chat

Reçoit la commande transcrite, appelle Claude, puis génère et streame l'audio TTS.

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from anthropic import AsyncAnthropic
import httpx
from app.config import settings

router = APIRouter()

@router.post("/api/chat")
async def chat(request: ChatRequest):
    """
    1. Reçoit la transcription de la commande utilisateur
    2. Appelle Claude Sonnet pour générer une réponse
    3. Envoie la réponse à ElevenLabs TTS
    4. Streame l'audio au frontend
    
    Retourne :
    - Headers custom X-Response-Text avec le texte de la réponse LLM
    - Body : stream audio MP3
    """
    
    # 1. Appel LLM (Claude)
    anthropic = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    
    llm_response = await anthropic.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system="""Tu es AURA, un assistant vocal IA professionnel.
Tu réponds de manière concise car tes réponses sont lues à voix haute.
Limite tes réponses à 2-3 phrases maximum sauf si la demande nécessite plus.
Réponds en français.""",
        messages=[
            {"role": "user", "content": request.text}
        ]
    )
    
    response_text = llm_response.content[0].text
    
    # 2. Appel ElevenLabs TTS (streaming)
    async def stream_tts():
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"https://api.elevenlabs.io/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}/stream",
                headers={
                    "xi-api-key": settings.ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "text": response_text,
                    "model_id": "eleven_flash_v2_5",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                    "output_format": "mp3_22050_32",
                },
            ) as tts_response:
                async for chunk in tts_response.aiter_bytes(chunk_size=4096):
                    yield chunk
    
    return StreamingResponse(
        stream_tts(),
        media_type="audio/mpeg",
        headers={
            "X-Response-Text": response_text,  # Le frontend récupère le texte ici
            "Access-Control-Expose-Headers": "X-Response-Text",
        },
    )
```

**Schema de la requête :**

```python
from pydantic import BaseModel

class ChatRequest(BaseModel):
    text: str  # Transcription de la commande vocale
```

**Note sur X-Response-Text :** Le header custom permet au frontend de récupérer le texte de la réponse LLM AVANT que le stream audio soit terminé. Ainsi il peut afficher le texte immédiatement tout en jouant l'audio progressivement. Pour les textes longs, considérer l'encodage URL du header ou utiliser un endpoint séparé.

**Alternative plus robuste :** Au lieu d'un seul endpoint qui retourne l'audio, faire deux appels séparés :
1. `POST /api/chat` → retourne `{ text: "...", audio_url: "/api/tts/{id}" }`
2. `GET /api/tts/{id}` → streame l'audio

Cette approche est plus propre mais ajoute un round-trip. Pour le POC, le header custom suffit.

### 6.4 System prompt AURA (pour le LLM)

```
Tu es AURA, un assistant vocal IA professionnel intégré dans une enceinte intelligente.

Contexte :
- L'utilisateur te parle à voix haute après avoir dit le mot "Aura"
- Tes réponses seront lues à voix haute par synthèse vocale
- Tu dois donc être CONCIS et NATUREL à l'oral

Règles :
1. Réponds en français sauf si l'utilisateur parle dans une autre langue
2. Sois concis : 2-3 phrases pour une réponse simple, 5-6 max pour quelque chose de complexe
3. Pas de formatting Markdown (pas de **, pas de listes à puces, pas de headers)
4. Pas d'URLs, pas de liens
5. Utilise un ton professionnel mais chaleureux
6. Si tu ne sais pas quelque chose, dis-le simplement
7. N'invente pas d'informations sur des réunions ou conversations — pour l'instant tu n'as pas accès à la mémoire contextuelle

Note : Ce POC ne dispose pas encore de mémoire contextuelle.
Si l'utilisateur demande de résumer une réunion ou de retrouver une information passée,
explique poliment que cette fonctionnalité est en cours de développement.
```

### 6.5 Variables d'environnement backend

```env
# .env
ELEVENLABS_API_KEY=xxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=xxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
```

Pour trouver un voice_id :
- Aller sur https://elevenlabs.io/voice-library
- Chercher une voix française naturelle
- Copier le voice_id depuis l'URL ou l'API

### 6.6 Requirements

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-dotenv==1.0.1
anthropic==0.43.0
httpx==0.28.1
pydantic==2.10.3
```

### 6.7 Lancement

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

---

## 7. Picovoice Porcupine — Intégration (inchangée)

### 7.1 Installation

```bash
npm install @picovoice/porcupine-web @picovoice/web-voice-processor
```

### 7.2 Clé d'accès

Créer un compte sur https://console.picovoice.ai/ et générer une AccessKey gratuite.

### 7.3 Mot-clé

- **Custom "Aura"** : nécessite entraînement sur Picovoice Console + fichier `.ppn` téléchargé dans `/public/porcupine/aura_wasm.ppn`
- **Fallback** : utiliser un mot built-in gratuit ("Computer", "Jarvis", "Bumblebee")

### 7.4 Stratégie de fallback

1. Tenter de charger le keyword custom "Aura" 
2. Si échoue → fallback keyword built-in "Computer"
3. Si échoue aussi → mode **bouton push-to-talk** (bouton cliquable qui remplace le wake word)
4. Afficher le mode actif dans l'interface

### 7.5 Partage du flux audio

**Point critique** : Porcupine Web utilise le `WebVoiceProcessor` qui capture le micro. L'AudioWorklet pour le downsampling 16kHz utilise aussi le micro.

Solution : **un seul `MediaStream`** partagé.

```typescript
// 1. Capturer le micro une seule fois
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

// 2. Porcupine utilise le stream
// (WebVoiceProcessor peut prendre un MediaStream existant)

// 3. AudioWorklet utilise le même stream
const source = audioContext.createMediaStreamSource(stream);
await audioContext.audioWorklet.addModule('/pcmProcessor.worklet.js');
const processorNode = new AudioWorkletNode(audioContext, 'pcm-processor');
source.connect(processorNode);
```

Porcupine tourne en PERMANENCE (idle + listening + speaking). Le downsampling + envoi à ElevenLabs STT ne tourne que pendant l'état `listening`.

---

## 8. Gestion des cas limites

### 8.1 Micro refusé
- État `error`, message : "Accès au microphone requis"
- Bouton "Réessayer"

### 8.2 Porcupine échoue
- Fallback keyword built-in → si échoue aussi → mode bouton push-to-talk
- Warning visible dans l'interface

### 8.3 Token STT expiré / erreur WebSocket
- Si le WebSocket ElevenLabs se ferme inopinément : redemander un token, reconnecter
- Si échec après 2 tentatives : afficher erreur, revenir à idle

### 8.4 LLM timeout
- Timeout : 15 secondes
- Si dépassé : revenir à idle, message "Erreur de connexion, réessayez"

### 8.5 TTS échoue
- Si ElevenLabs TTS échoue : afficher la réponse texte uniquement (sans audio)
- Message discret : "Synthèse vocale indisponible"

### 8.6 Commande trop courte (< 500ms de parole)
- Ne pas envoyer au backend
- Revenir à idle silencieusement

### 8.7 Commande trop longue (> 30s)
- Timeout, envoyer ce qu'on a
- Committer manuellement

### 8.8 Interruption pendant le TTS
- L'utilisateur dit le wake word pendant que AURA parle
- Stopper immédiatement la lecture audio
- Passer en listening, nouvelle commande

### 8.9 Navigateur non supporté
- Requis : Chrome 90+, Edge 90+, Firefox 100+
- WebAssembly requis (pour Porcupine)
- AudioWorklet requis (pour downsampling)
- Afficher message clair si non supporté

---

## 9. Design & UI

### 9.1 Palette de couleurs

| Nom | Hex | Usage |
|-----|-----|-------|
| Background | `#0a0a0f` | Fond principal (dark) |
| Surface | `#141420` | Cartes, panels |
| Surface hover | `#1e1e30` | Hover |
| Blue idle | `#3b82f6` | Orbe en attente |
| Green listening | `#22c55e` | Wake word détecté, écoute |
| Amber thinking | `#f59e0b` | Traitement LLM |
| Purple speaking | `#8b5cf6` | AURA parle (TTS) |
| Red error | `#ef4444` | Erreurs |
| Text primary | `#f1f5f9` | Texte principal |
| Text secondary | `#94a3b8` | Texte secondaire |
| Text muted | `#475569` | Timestamps, labels |

### 9.2 Typographie

- Font : **Inter** (Google Fonts)
- "AURA" : 32px, font-bold, tracking-wider
- Mot-clé : 14px, text-secondary, italic
- Status : 18px, text-primary
- Live transcript : 20px, text-primary, font-medium
- Historique : 15px, text-primary
- Timestamps : 12px, text-muted, font-mono

### 9.3 L'Orbe

Cercle 180px (140px mobile). Dégradé radial. Glow coloré (box-shadow 0 0 60px). Animations CSS Tailwind. Scale réactif au volume en listening. Anneau rotatif en thinking.

### 9.4 Son de confirmation wake word

Beep programmatique 880Hz, 200ms, via AudioContext oscillator.

### 9.5 Responsive

Desktop > 768px : centré, max-width 600px. Mobile : orbe 140px, padding réduit.

---

## 10. Sécurité HTTPS & Micro

`getUserMedia()` requiert HTTPS ou localhost.

Dev : `localhost:3000` → OK.
Test mobile : utiliser ngrok ou déployer sur Vercel (HTTPS auto).

---

## 11. Tests manuels

### Test 1 : Initialisation
- Ouvrir la page, accepter le micro
- Orbe bleu, volume réactif

### Test 2 : Wake word
- Dire "Aura" → orbe vert, son de confirmation, "Je vous écoute..."

### Test 3 : Transcription temps réel
- Après wake word, parler lentement
- Le texte s'écrit en temps réel dans le LiveTranscript
- Vérifier les partial_transcript

### Test 4 : Commande complète → réponse LLM
- Dire "Aura, bonjour comment ça va"
- Silence 2s → orbe amber "Réflexion..."
- Réponse texte affichée + audio TTS joué
- Orbe violet pendant le TTS

### Test 5 : Interruption
- Dire "Aura, raconte-moi une histoire longue"
- Pendant que le TTS joue, dire "Aura"
- Le TTS s'arrête, orbe repasse en vert

### Test 6 : Enchaînement rapide
- Commande → réponse → wake word → nouvelle commande → nouvelle réponse
- Tout l'historique s'affiche

### Test 7 : Fallback bouton
- Mettre une mauvaise clé Porcupine
- Vérifier le bouton push-to-talk
- Cliquer → parler → transcription → réponse

### Test 8 : TTS indisponible
- Mettre une mauvaise clé ElevenLabs TTS
- Vérifier que la réponse texte s'affiche quand même

---

## 12. Ordre d'implémentation

### Étape 1 — Setup projet (30 min)
- Monorepo `/frontend` (Next.js) + `/backend` (FastAPI)
- Tailwind, TypeScript, env vars
- GET /health backend
- Page blanche "AURA POC"

### Étape 2 — Backend endpoints (1h)
- GET /api/stt-token (génération token ElevenLabs)
- POST /api/chat (Claude + TTS streaming)
- Test curl pour vérifier les endpoints

### Étape 3 — Capture micro + volume (1h)
- useAudioCapture hook : getUserMedia + AnalyserNode
- AudioWorklet PCM downsampling 16kHz
- VolumeIndicator fonctionnel

### Étape 4 — STT real-time ElevenLabs (2-3h)
- useElevenLabsSTT hook : WebSocket, envoi chunks, réception transcripts
- LiveTranscript component
- Bouton temporaire pour déclencher le STT (test sans Porcupine)
- Vérifier partial + committed transcripts

### Étape 5 — Porcupine Wake Word (1-2h)
- usePorcupine hook
- Connecter : wake word → STT → backend
- Fallback bouton push-to-talk
- Son de confirmation

### Étape 6 — LLM + TTS playback (2h)
- Envoi commande au POST /api/chat
- Réception stream audio TTS
- useAudioPlayer hook : lecture audio
- Affichage réponse texte

### Étape 7 — Orchestration + polish (2-3h)
- useAuraSession hook : machine à états complète
- Interruption pendant TTS
- Gestion de tous les cas limites
- AuraOrb animations
- Historique
- Tests manuels complets

**Temps total estimé : 2-3 jours de dev.**

---

## 13. Évolutions post-POC

Ce POC sera étendu progressivement. Prochaines étapes :

1. **Écoute passive continue** — WebSocket permanent browser → backend, transcription de tout
2. **Buffer Redis** — Couche 1 de la mémoire contextuelle
3. **Compaction + pgvector** — Couche 2, structuration et indexation
4. **Agent loop avec tools** — search_memory, generate_summary, etc.
5. **Actions** — send_whatsapp, send_email, update_crm
6. **Speaker diarization** — pyannote.audio pour identifier les locuteurs

L'architecture du code doit être propre pour faciliter ces ajouts, mais PAS les anticiper dans le code (pas de structures vides, pas d'abstractions prématurées).

---

*Ce document est le cahier des charges complet du POC web AURA v2 (ElevenLabs).*
*Conçu pour être donné directement à Claude Code comme unique contexte d'implémentation.*

*CONFIDENTIEL — HALLIA · AURA POC v2.0*
