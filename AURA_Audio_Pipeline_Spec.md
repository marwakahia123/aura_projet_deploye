# AURA — Cahier des Charges Technique : Pipeline Audio

**Version** : 1.0
**Projet** : HALLIA — AURA Assistant IA Permanent
**Scope** : Écoute permanente, Wake Word, STT, TTS, Pipeline de contexte
**Destinataire** : Claude Code (implémentation)

---

## 1. Vue d'ensemble

AURA est un device physique (enceinte) qui écoute en permanence l'environnement sonore d'un professionnel (bureau, salle de réunion). Il capture, transcrit et structure tout ce qui est dit autour de lui pour constituer une **mémoire contextuelle permanente**. Quand l'utilisateur prononce un wake word, AURA utilise cette mémoire pour répondre à des questions ou exécuter des actions.

### Pipeline global

```
Micro Array → VAD (edge) → Audio chunks → Cloud STT → Transcription brute
    → Buffer court terme (Redis) → Compaction intelligente → Mémoire structurée (pgvector)
    
Wake Word détecté → Commande vocale → STT → Agent Loop (LLM + Tools) → TTS → Réponse vocale
```

### Principes directeurs

- **Edge-first** : le VAD et le wake word tournent sur le device, zéro envoi cloud quand personne ne parle
- **Écoute permanente passive** : tout est transcrit et indexé en continu, sans intervention de l'utilisateur
- **Mémoire en 3 couches** : buffer temps réel, mémoire structurée, mémoire long terme condensée
- **Horodatage précis** : chaque segment est daté (UTC + timezone device), c'est un axe de recherche primaire
- **Latence vocale** : quand l'utilisateur parle à AURA après le wake word, la réponse doit arriver en < 3 secondes

---

## 2. Stack technique

### 2.1 Langage & Framework

| Composant | Choix | Justification |
|-----------|-------|---------------|
| Backend API | **FastAPI (Python 3.12+)** | Écosystème ML/audio Python, async natif, excellent pour les WebSockets |
| Runtime async | **asyncio + uvicorn** | Performance non-bloquante pour le streaming audio |
| Task queue | **Celery + Redis** (ou arq) | Jobs de compaction en background |

### 2.2 Audio & Speech

| Composant | Choix | Justification |
|-----------|-------|---------------|
| VAD (Voice Activity Detection) | **Silero VAD** | Modèle léger (~2 Mo), tourne sur CPU/ARM, précision excellente, open source |
| Wake Word | **Picovoice Porcupine** | < 300ms latence, < 2% faux positifs, fonctionne edge on-device, mot-clé custom "Aura" |
| STT (transcription) | **OpenAI Whisper API** (cloud) pour le MVP | WER < 10%, horodatage par segment, multilingue. Alternative locale : faster-whisper pour V2 |
| Speaker diarization | **pyannote.audio** | Identification des locuteurs (Speaker 1, Speaker 2…), open source |
| TTS (synthèse vocale) | **ElevenLabs API** (multilingual_v2) | Voix naturelle FR/EN, streaming, latence < 1s premier chunk |
| Audio streaming device→cloud | **WebSocket + opus codec** | Compression audio temps réel, faible bande passante |

### 2.3 Base de données & Mémoire

| Composant | Choix | Justification |
|-----------|-------|---------------|
| Base relationnelle | **PostgreSQL 16** | Stockage transactionnel, JSON, requêtes complexes |
| Index vectoriel | **pgvector** (extension PG) | Recherche sémantique ANN dans la même DB, filtres SQL combinables |
| Cache / Buffer temps réel | **Redis 7** | Buffer de transcription brute (2-3h), état des sessions, pub/sub |
| Embeddings | **OpenAI text-embedding-3-small** | 1536 dimensions, bon rapport qualité/coût |

### 2.4 LLM & Orchestration

| Composant | Choix | Justification |
|-----------|-------|---------------|
| LLM principal | **Claude Sonnet** (Anthropic API) | Function calling natif, 200k context window, bon en français |
| LLM léger (compaction, parsing) | **Claude Haiku** | Rapide, pas cher, suffisant pour structuration et extraction |
| Orchestration | **Agent loop maison avec function calling** | Pas de framework externe (LangChain, etc.), boucle simple et contrôlable |

### 2.5 Infrastructure

| Composant | Choix | Justification |
|-----------|-------|---------------|
| Conteneurs | **Docker Compose** (dev/staging) | Simple, reproductible |
| Cloud | **AWS** (ECS ou Cloud Run en prod) | Pas de Kubernetes au MVP |
| CI/CD | **GitHub Actions** | Standard, gratuit pour le volume MVP |

---

## 3. Module 1 : Écoute permanente & VAD

### 3.1 Objectif

Le device capte l'audio ambiant en continu. Le VAD (Voice Activity Detection) détecte quand quelqu'un parle et ne transmet au cloud que les segments de parole. Les silences ne quittent jamais le device.

### 3.2 Comportement attendu

```
Micro → Buffer audio circulaire (30s) → Silero VAD
    Si parole détectée :
        → Encoder en Opus
        → Envoyer au backend via WebSocket
        → Backend accumule les segments
    Si silence > 3 secondes après parole :
        → Marquer fin de segment vocal
        → Envoyer marqueur "end_of_speech" au backend
```

### 3.3 Spécifications

| Paramètre | Valeur | Notes |
|-----------|--------|-------|
| Format audio micro | PCM 16-bit, 16 kHz, mono | Standard pour le speech processing |
| Taille frame VAD | 512 samples (32ms) | Recommandation Silero |
| Seuil VAD | 0.5 (configurable) | Probabilité de parole |
| Padding avant parole | 300ms | Garder le début de phrase (pre-buffer) |
| Timeout silence | 3 secondes | Durée avant de considérer la fin d'un segment |
| Codec streaming | Opus, 16 kHz, 32 kbps | Compression ~10x vs PCM brut |
| Transport | WebSocket (wss://) | Connexion persistante device → backend |
| Réduction volume silence | Ne PAS envoyer le silence | Économie bande passante 60-70% |

### 3.4 API WebSocket (device → backend)

Endpoint : `wss://api.aura.hallia.com/ws/audio-stream`

Messages entrants (device → backend) :

```json
// Début de session
{
    "type": "session_start",
    "device_id": "uuid",
    "user_id": "uuid",
    "timezone": "Europe/Paris",
    "sample_rate": 16000
}

// Chunk audio (parole détectée par VAD)
{
    "type": "audio_chunk",
    "data": "<base64 encoded opus>",
    "timestamp": "2026-02-27T14:32:15.123Z",
    "vad_confidence": 0.87
}

// Fin de segment vocal (silence détecté)
{
    "type": "end_of_speech",
    "timestamp": "2026-02-27T14:32:45.456Z",
    "duration_ms": 30333
}
```

Messages sortants (backend → device) :

```json
// Accusé de réception
{ "type": "ack", "status": "ok" }

// Changement d'état LED
{ "type": "led_state", "color": "green", "pattern": "pulse" }

// Réponse TTS (audio)
{ "type": "tts_audio", "data": "<base64 encoded audio>", "is_final": false }
```

### 3.5 Fichiers à créer

```
app/
├── core/
│   ├── vad.py              # Wrapper Silero VAD (si traitement côté serveur aussi)
│   └── audio_stream.py     # Gestionnaire WebSocket audio entrant
├── api/
│   └── routes/
│       └── ws_audio.py     # Endpoint WebSocket
```

---

## 4. Module 2 : Wake Word

### 4.1 Objectif

Détecter le mot-clé "Aura" (ou variante configurable) pour déclencher le mode commande. La détection tourne en local sur le device, sans cloud.

### 4.2 Comportement attendu

```
État IDLE (écoute passive, LED éteinte ou vert dim)
    → Wake word "Aura" détecté
    → LED vert vif + son de confirmation
    → Passer en état LISTENING
    → Streamer l'audio de la commande au backend
    → Backend transcrit la commande (STT)
    → Backend exécute via agent loop
    → Backend envoie réponse TTS
    → LED jaune pendant traitement
    → LED retour idle après réponse
```

### 4.3 Spécifications

| Paramètre | Valeur | Notes |
|-----------|--------|-------|
| Moteur | Picovoice Porcupine | SDK Python + SDK embarqué ARM |
| Mot-clé | "Aura" (custom keyword) | Nécessite licence Picovoice pour custom keyword |
| Latence détection | < 300ms | Mesuré du moment où le mot est prononcé |
| Faux positifs | < 2% | Taux d'activation accidentelle |
| Faux négatifs | < 5% | Taux de non-détection quand le mot est dit |
| Sensibilité | 0.7 (configurable 0.0-1.0) | Plus haut = plus sensible mais plus de faux positifs |
| Audio frame | 512 samples à 16 kHz | Frame size Porcupine |

### 4.4 États du device

```python
class DeviceState(Enum):
    IDLE = "idle"                # Écoute passive, VAD actif, wake word actif
    LISTENING = "listening"      # Wake word détecté, enregistre la commande
    PROCESSING = "processing"    # Commande envoyée, en attente de réponse
    RESPONDING = "responding"    # TTS en cours de lecture
    MUTED = "muted"             # Micro coupé physiquement (switch hardware)
```

### 4.5 Signaux LED

| État | Couleur | Pattern |
|------|---------|---------|
| IDLE | Vert dim | Fixe ou off (configurable) |
| Wake word détecté | Vert vif | Flash 200ms |
| LISTENING | Vert vif | Pulsation lente |
| PROCESSING | Jaune | Rotation circulaire |
| RESPONDING | Jaune | Pulsation au rythme de la voix |
| MUTED | Rouge | Fixe |
| Erreur | Rouge | Clignotement rapide |

### 4.6 API interne

Message WebSocket envoyé par le device quand le wake word est détecté :

```json
{
    "type": "wake_word_detected",
    "keyword": "aura",
    "confidence": 0.92,
    "timestamp": "2026-02-27T14:35:00.000Z"
}
```

Le backend passe alors en mode "commande" : les prochains chunks audio seront traités comme la commande utilisateur et non comme de l'écoute passive.

### 4.7 Simulateur pour développement backend

Pour développer et tester sans hardware physique, créer un simulateur qui :
- Envoie un signal `wake_word_detected` via API REST ou WebSocket
- Permet d'envoyer un fichier audio ou du texte comme commande simulée
- Émule les changements d'état du device

Endpoint REST de simulation :

```
POST /api/v1/dev/simulate-wake-word
Body: { "command_text": "résume la réunion de tout à l'heure" }
       ou
Body: { "command_audio": "<base64 wav>" }
```

---

## 5. Module 3 : STT (Speech-to-Text)

### 5.1 Objectif

Transcrire en temps réel tout l'audio capté (écoute passive) et les commandes vocales (après wake word).

### 5.2 Deux modes de transcription

#### Mode 1 : Transcription passive (écoute continue)

L'audio arrive par le WebSocket en continu. Le backend accumule les segments vocaux (détectés par le VAD) et les transcrit par blocs.

```
Segments audio VAD → Accumulation (5-15 secondes) → Appel Whisper API → Segments transcrits
    → Stockage dans le buffer Redis avec timestamps
    → Quand le seuil de compaction est atteint → Job de structuration
```

| Paramètre | Valeur |
|-----------|--------|
| Taille de batch transcription | 5-15 secondes d'audio |
| Provider STT | OpenAI Whisper API (`whisper-1`) |
| Langue | `fr` par défaut, auto-détection possible |
| Format réponse | `verbose_json` (inclut timestamps par segment) |
| Diarization | pyannote.audio en post-traitement |
| Latence acceptable | 5-10 secondes (pas de contrainte temps réel strict) |

#### Mode 2 : Transcription commande (après wake word)

L'utilisateur parle directement à AURA. La transcription doit être rapide.

| Paramètre | Valeur |
|-----------|--------|
| Latence cible | < 1 seconde |
| Provider STT | OpenAI Whisper API (même, mais prioritaire) |
| Détection fin de commande | Silence > 1.5s après parole |
| Streaming | Si possible, utiliser le mode streaming pour retourner la transcription au fur et à mesure |

### 5.3 Format de sortie STT

Chaque transcription produit une liste de segments :

```json
{
    "segments": [
        {
            "text": "On pourrait baisser le prix à 14 euros si on prend 500 unités",
            "start": 0.0,
            "end": 4.2,
            "confidence": 0.94,
            "speaker": null
        }
    ],
    "language": "fr",
    "duration": 4.2
}
```

Après diarization (pyannote), chaque segment est enrichi avec `speaker: "SPEAKER_01"`.

### 5.4 Horodatage

**CRITIQUE** : Chaque segment transcrit DOIT avoir un horodatage absolu précis.

```json
{
    "text": "On pourrait baisser le prix...",
    "absolute_start": "2026-02-27T14:32:15.000Z",
    "absolute_end": "2026-02-27T14:32:19.200Z",
    "relative_start": 0.0,
    "relative_end": 4.2,
    "date": "2026-02-27",
    "time_slot": "afternoon",
    "day_of_week": "friday",
    "week_number": 9,
    "timezone": "Europe/Paris",
    "speaker": "SPEAKER_01",
    "confidence": 0.94
}
```

Le `absolute_start` est calculé à partir du timestamp du chunk audio WebSocket + l'offset relatif dans le segment Whisper.

Les champs `time_slot`, `day_of_week`, `week_number` sont dérivés et stockés en metadata pour faciliter les recherches temporelles (ex: "qu'est-ce qu'on a dit mardi matin").

Définition des time_slots :
- `morning` : 06:00 - 12:00
- `afternoon` : 12:00 - 18:00
- `evening` : 18:00 - 22:00
- `night` : 22:00 - 06:00

### 5.5 Fichiers à créer

```
app/
├── core/
│   ├── stt.py               # Wrapper Whisper API (transcription)
│   ├── diarization.py       # Wrapper pyannote.audio (identification locuteurs)
│   └── transcript_manager.py # Accumulation, batching, horodatage absolu
```

---

## 6. Module 4 : Pipeline de contexte & Mémoire

### 6.1 Architecture 3 couches

```
┌────────────────────────────────────────────────────────────┐
│ COUCHE 1 — Buffer court terme (Redis)                       │
│ Dernières 2-3 heures de transcription brute                 │
│ Accès direct, pas de recherche vectorielle                  │
│ TTL : 3 heures glissantes                                   │
└───────────────────────┬────────────────────────────────────┘
                        │ Compaction (trigger dynamique)
┌───────────────────────▼────────────────────────────────────┐
│ COUCHE 2 — Mémoire structurée (PostgreSQL + pgvector)       │
│ Chunks optimisés avec embeddings vectoriels                 │
│ Faits extraits, décisions, chiffres, engagements            │
│ Recherche hybride : sémantique + temporelle                 │
│ Rétention : 90 jours (configurable)                         │
└───────────────────────┬────────────────────────────────────┘
                        │ Condensation (hebdomadaire)
┌───────────────────────▼────────────────────────────────────┐
│ COUCHE 3 — Mémoire long terme condensée (PostgreSQL + pgvector) │
│ Résumés de résumés, faits clés persistants                  │
│ "Semaine 9 : négociation prix fournisseur X, dernier tarif 14.50€" │
│ Rétention : illimitée                                        │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Couche 1 — Buffer court terme (Redis)

Stocke la transcription brute des dernières heures, directement accessible.

Structure Redis :

```
# Liste ordonnée par timestamp
Key: "buffer:{user_id}:segments"
Value: Sorted Set, score = timestamp Unix

Chaque membre :
{
    "text": "On pourrait baisser le prix...",
    "speaker": "SPEAKER_01",
    "start": "2026-02-27T14:32:15.000Z",
    "end": "2026-02-27T14:32:19.200Z",
    "confidence": 0.94
}

# Compteur de tokens non compactés
Key: "buffer:{user_id}:token_count"
Value: int (incrémenté à chaque nouveau segment)

# TTL automatique : 3 heures sur chaque segment
```

### 6.3 Trigger de compaction dynamique

La compaction de la couche 1 vers la couche 2 est déclenchée par UN des critères suivants :

| Critère | Seuil | Explication |
|---------|-------|-------------|
| Volume de tokens | **4 000 tokens** accumulés | Seuil principal, basé sur le contenu réel |
| Timer maximum | **30 minutes** depuis dernière compaction | Filet de sécurité pour flux lent continu |
| Fin de conversation | **5 minutes de silence** après activité | Moment naturel de clôture d'un bloc |

Implémentation :

```python
# Pseudo-code du trigger
async def check_compaction_trigger(user_id: str):
    token_count = await redis.get(f"buffer:{user_id}:token_count")
    last_compaction = await redis.get(f"buffer:{user_id}:last_compaction")
    last_speech = await redis.get(f"buffer:{user_id}:last_speech_at")
    
    now = datetime.utcnow()
    
    should_compact = (
        token_count >= 4000
        or (now - last_compaction).minutes >= 30
        or (now - last_speech).minutes >= 5 and token_count > 500
    )
    
    if should_compact:
        await trigger_compaction_job(user_id)
```

### 6.4 Job de compaction (couche 1 → couche 2)

Ce job est le composant le plus critique du système. Il transforme la transcription brute en mémoire structurée.

**Étape 1 : Récupération du buffer**

Lire tous les segments non compactés depuis Redis pour cet utilisateur.

**Étape 2 : Segmentation en conversations (appel LLM Haiku)**

Prompt système :

```
Tu es un système d'analyse de transcription audio.
Tu reçois un flux de transcription brute avec timestamps et locuteurs.
Ton travail est d'identifier les conversations distinctes dans ce flux.

Une "conversation" est un échange continu sur un sujet entre des personnes.
Un changement de sujet majeur ou un silence long (> 2 min) marque une nouvelle conversation.

Réponds UNIQUEMENT en JSON :
{
    "conversations": [
        {
            "title": "Titre court descriptif",
            "start": "timestamp ISO",
            "end": "timestamp ISO",
            "speakers": ["SPEAKER_01", "SPEAKER_02"],
            "topic_tags": ["prix", "fournisseur", "négociation"],
            "segment_indices": [0, 1, 2, 3, 4]
        }
    ]
}
```

**Étape 3 : Extraction de faits (appel LLM Haiku par conversation)**

Prompt système :

```
Tu es un système d'extraction d'informations à partir de transcriptions de réunions/conversations professionnelles.

Pour chaque conversation fournie, extrait TOUS les éléments factuels importants :
- Chiffres et montants mentionnés (prix, quantités, dates, pourcentages)
- Noms propres (personnes, entreprises, produits, lieux)
- Décisions prises
- Engagements / promesses ("je rappelle demain", "on envoie le devis")
- Questions restées sans réponse
- Points de désaccord

IMPORTANT : Ne résume PAS. Extrait les faits avec leur formulation proche de l'originale.
Garde les chiffres exacts, ne les arrondis pas.

Réponds UNIQUEMENT en JSON :
{
    "conversation_title": "...",
    "time_range": { "start": "...", "end": "..." },
    "facts": [
        {
            "type": "number|decision|commitment|person|disagreement|question",
            "content": "Le fournisseur X propose 14.50€/unité pour 500+ unités",
            "speaker": "SPEAKER_01",
            "importance": "high|medium|low",
            "timestamp": "2026-02-27T14:33:00.000Z"
        }
    ],
    "summary": "Résumé en 2-3 phrases maximum"
}
```

**Étape 4 : Création des chunks et embeddings**

Pour chaque conversation, créer des chunks de deux types :

Type A — **Chunk détaillé** (quasi-verbatim) :
- Contenu : transcription nettoyée de la conversation (sans hésitations, "euh", répétitions)
- Découpage : par blocs de ~500 tokens avec 50 tokens de chevauchement
- Usage : retrouver le contexte exact quand l'utilisateur demande les détails

Type B — **Chunk résumé** (faits extraits) :
- Contenu : le résumé + la liste des faits extraits, formatés en texte
- Un seul chunk par conversation
- Usage : répondre rapidement à "c'était quoi le prix ?" sans relire toute la conversation

Chaque chunk (type A et B) reçoit un embedding (text-embedding-3-small) et est stocké dans pgvector.

**Étape 5 : Stockage dans PostgreSQL**

Structure de la table `memory_chunks` :

```sql
CREATE TABLE memory_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Contenu
    content TEXT NOT NULL,
    chunk_type VARCHAR(50) NOT NULL,  -- 'detailed' | 'summary' | 'fact' | 'long_term'
    
    -- Embedding vectoriel
    embedding vector(1536) NOT NULL,
    
    -- Horodatage (CRITIQUE)
    absolute_start TIMESTAMPTZ NOT NULL,
    absolute_end TIMESTAMPTZ NOT NULL,
    date DATE NOT NULL,                    -- index pour requêtes par jour
    time_slot VARCHAR(20) NOT NULL,        -- 'morning' | 'afternoon' | 'evening' | 'night'
    day_of_week VARCHAR(10) NOT NULL,      -- 'monday' ... 'sunday'
    week_number INTEGER NOT NULL,
    
    -- Metadata
    speakers TEXT[],                         -- ARRAY de locuteurs
    topic_tags TEXT[],                       -- Tags thématiques
    conversation_title VARCHAR(500),
    importance VARCHAR(10) DEFAULT 'medium', -- 'high' | 'medium' | 'low'
    
    -- Référence
    source_type VARCHAR(50) DEFAULT 'ambient', -- 'ambient' | 'meeting' | 'phone_call'
    meeting_id UUID REFERENCES meetings(id),
    
    -- Gestion
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,                 -- Pour la rétention configurable
    is_compacted BOOLEAN DEFAULT FALSE      -- Marqué TRUE quand condensé en couche 3
);

-- Index critiques
CREATE INDEX idx_chunks_user_date ON memory_chunks(user_id, date);
CREATE INDEX idx_chunks_user_time ON memory_chunks(user_id, absolute_start);
CREATE INDEX idx_chunks_user_week ON memory_chunks(user_id, week_number);
CREATE INDEX idx_chunks_embedding ON memory_chunks USING ivfflat (embedding vector_cosine_ops);
```

**Étape 6 : Nettoyage buffer Redis**

Après compaction réussie, les segments traités sont marqués comme compactés dans Redis (mais gardés encore 1h en fallback). Le compteur de tokens est remis à zéro.

### 6.5 Recherche hybride (sémantique + temporelle)

Quand l'utilisateur pose une question, la recherche combine filtres temporels et recherche vectorielle.

**Étape 1 : Parsing temporel de la requête (LLM Haiku)**

```
Prompt : "L'utilisateur demande : '{query}'. 
Il est actuellement {current_datetime}, timezone {timezone}.
Extrais les filtres temporels implicites ou explicites.

Réponds en JSON :
{
    "has_time_filter": true,
    "date_start": "2026-02-26T00:00:00Z" ou null,
    "date_end": "2026-02-26T23:59:59Z" ou null,
    "time_slot": "morning" ou null,
    "day_of_week": "tuesday" ou null,
    "relative_reference": "yesterday" ou "last_week" ou null,
    "semantic_query": "prix fournisseur délais"   // la partie non-temporelle
}"
```

Exemples de parsing :
- "hier matin" → date_start = hier 06:00, date_end = hier 12:00
- "mardi dernier" → date_start = mardi 00:00, date_end = mardi 23:59
- "la semaine dernière" → week_number = semaine précédente
- "tout à l'heure" → date_start = aujourd'hui - 4h, date_end = maintenant
- "le call avec Dupont" → pas de filtre temporel, semantic_query = "call Dupont"

**Étape 2 : Requête pgvector filtrée**

```sql
SELECT content, chunk_type, conversation_title, absolute_start, topic_tags,
       1 - (embedding <=> $query_embedding::vector) as similarity
FROM memory_chunks
WHERE user_id = $user_id
  AND ($date_start IS NULL OR absolute_start >= $date_start)
  AND ($date_end IS NULL OR absolute_end <= $date_end)
  AND ($time_slot IS NULL OR time_slot = $time_slot)
ORDER BY embedding <=> $query_embedding::vector
LIMIT 10;
```

**Étape 3 : Assemblage du contexte pour le LLM**

Prendre les résultats et les formatter en contexte injectable :

```
[Source 1 | Jeudi 27 février 14h32 | "Négociation prix fournisseur" | similarité: 0.89]
Le fournisseur X propose 14.50€/unité pour 500+ unités. SPEAKER_01 a demandé
si on pouvait descendre à 13€. Le fournisseur a dit qu'il devait vérifier.

[Source 2 | Mercredi 26 février 10h15 | "Point hebdo équipe" | similarité: 0.72]
Discussion sur les budgets Q2. Le plafond par fournisseur est de 50K€.
```

### 6.6 Couche 3 — Condensation long terme

Job hebdomadaire (Celery beat) qui :
1. Prend tous les chunks de couche 2 de la semaine passée
2. Les envoie au LLM pour un résumé condensé par thème/sujet
3. Crée des chunks de type `long_term` avec de nouveaux embeddings
4. Marque les chunks originaux comme `is_compacted = TRUE`
5. Les chunks compactés sont gardés 90 jours puis purgés (configurable)

### 6.7 Fichiers à créer

```
app/
├── core/
│   ├── memory/
│   │   ├── __init__.py
│   │   ├── buffer.py           # Couche 1 : gestion du buffer Redis
│   │   ├── compaction.py       # Job de compaction : couche 1 → couche 2
│   │   ├── condensation.py     # Job de condensation : couche 2 → couche 3
│   │   ├── search.py           # Recherche hybride (sémantique + temporelle)
│   │   ├── context_builder.py  # Assemblage du contexte pour le prompt LLM
│   │   └── embeddings.py       # Wrapper OpenAI embeddings
│   ├── temporal_parser.py      # Parsing des références temporelles
```

---

## 7. Module 5 : TTS (Text-to-Speech)

### 7.1 Objectif

Quand AURA doit répondre vocalement (après une commande), synthétiser la réponse en audio naturel et la streamer vers le device.

### 7.2 Spécifications

| Paramètre | Valeur |
|-----------|--------|
| Provider | ElevenLabs API |
| Modèle | `eleven_multilingual_v2` |
| Voix | À configurer (voix FR naturelle) |
| Streaming | Oui — commencer la lecture avant la fin de la génération |
| Format sortie | MP3 ou PCM |
| Latence premier chunk | < 500ms |
| Latence totale (texte court) | < 1.5 secondes |

### 7.3 Streaming TTS

Le backend doit streamer l'audio TTS vers le device au fur et à mesure de la génération, pas attendre que tout soit généré.

```
LLM génère la réponse texte (streaming) 
    → Dès qu'une phrase complète est disponible
    → Envoyer à ElevenLabs 
    → Streamer les chunks audio au device via WebSocket
    → Le device commence à jouer immédiatement
```

Pour optimiser la latence perçue :
- Le LLM génère en streaming (token par token)
- Dès qu'une phrase complète est détectée (point, point d'exclamation, retour ligne), elle est envoyée au TTS
- Le TTS streame l'audio en chunks de ~100ms
- Le device bufferise 200ms puis commence la lecture

### 7.4 Fichiers à créer

```
app/
├── core/
│   ├── tts.py                # Wrapper ElevenLabs, streaming
│   └── response_streamer.py  # Coordination LLM streaming → TTS → WebSocket device
```

---

## 8. Module 6 : Agent Loop (Orchestration des actions)

### 8.1 Objectif

Quand l'utilisateur donne une commande après le wake word, le système doit comprendre la demande, utiliser la mémoire contextuelle, et exécuter des actions si nécessaire.

### 8.2 Fonctionnement de la boucle

```python
async def agent_loop(user_command: str, user_id: str, session: Session):
    """
    Boucle principale de l'agent AURA.
    Reçoit une commande en langage naturel, utilise les tools disponibles,
    et retourne une réponse (texte → TTS).
    """
    
    # 1. Construire le contexte initial
    #    - Buffer court terme (dernières minutes)
    #    - Datetime courante + timezone
    #    - Profil utilisateur (préférences, canaux)
    
    # 2. Premier appel LLM avec les tools déclarés
    
    # 3. Boucle tant que le LLM retourne des tool_use :
    #    a. Exécuter le tool demandé
    #    b. Si action irréversible → demander confirmation vocale
    #    c. Renvoyer le résultat au LLM
    #    d. Le LLM décide : autre tool, ou réponse finale
    
    # 4. Quand le LLM retourne du texte → envoyer au TTS → device
    
    # Garde-fou : maximum 10 tours de boucle
```

### 8.3 Tools à implémenter pour le MVP

#### Tool 1 : `search_memory`

```json
{
    "name": "search_memory",
    "description": "Recherche dans la mémoire contextuelle de l'utilisateur. Utilise ce tool pour retrouver des informations de conversations passées. Supporte les filtres temporels. Retourne les passages les plus pertinents avec leurs horodatages et sources.",
    "parameters": {
        "query": {
            "type": "string",
            "description": "Ce qu'on cherche, en langage naturel"
        },
        "date_start": {
            "type": "string",
            "description": "Filtre début (ISO 8601). Null si pas de contrainte temporelle.",
            "nullable": true
        },
        "date_end": {
            "type": "string",
            "description": "Filtre fin (ISO 8601). Null si pas de contrainte temporelle.",
            "nullable": true
        },
        "time_slot": {
            "type": "string",
            "enum": ["morning", "afternoon", "evening", "night"],
            "description": "Créneau horaire. Null si pas pertinent.",
            "nullable": true
        },
        "top_k": {
            "type": "integer",
            "description": "Nombre de résultats (défaut: 5, max: 20)",
            "default": 5
        }
    }
}
```

#### Tool 2 : `get_recent_context`

```json
{
    "name": "get_recent_context",
    "description": "Récupère la transcription brute récente (buffer court terme). Utilise ce tool quand l'utilisateur fait référence à quelque chose dit il y a quelques minutes ou 'tout à l'heure' (< 3 heures). Plus rapide que search_memory pour le contexte très récent.",
    "parameters": {
        "minutes_back": {
            "type": "integer",
            "description": "Combien de minutes en arrière (défaut: 30, max: 180)",
            "default": 30
        }
    }
}
```

#### Tool 3 : `generate_summary`

```json
{
    "name": "generate_summary",
    "description": "Génère un résumé structuré à partir de segments de transcription. Retourne : résumé, décisions, action items, chiffres clés.",
    "parameters": {
        "context": {
            "type": "string",
            "description": "Le texte de transcription à résumer"
        },
        "format": {
            "type": "string",
            "enum": ["short", "detailed", "bullet_points"],
            "description": "Format du résumé souhaité",
            "default": "detailed"
        }
    }
}
```

#### Tool 4 : `send_whatsapp`

```json
{
    "name": "send_whatsapp",
    "description": "Envoie un message WhatsApp. ATTENTION : action irréversible, toujours demander confirmation à l'utilisateur avant d'appeler ce tool.",
    "parameters": {
        "recipient": {
            "type": "string",
            "description": "Numéro ou nom du contact (résolu depuis le profil utilisateur)",
            "default": "self"
        },
        "message": {
            "type": "string",
            "description": "Contenu du message à envoyer"
        }
    }
}
```

#### Tool 5 : `send_email`

```json
{
    "name": "send_email",
    "description": "Envoie un email. ATTENTION : action irréversible, toujours demander confirmation à l'utilisateur avant d'appeler ce tool.",
    "parameters": {
        "to": {
            "type": "string",
            "description": "Adresse email du destinataire"
        },
        "subject": {
            "type": "string",
            "description": "Sujet de l'email"
        },
        "body": {
            "type": "string",
            "description": "Corps de l'email (texte ou HTML)"
        }
    }
}
```

#### Tool 6 : `get_user_preferences`

```json
{
    "name": "get_user_preferences",
    "description": "Récupère les préférences et informations du profil utilisateur : canaux de communication préférés, contacts fréquents, email, téléphone, timezone.",
    "parameters": {}
}
```

### 8.4 Gestion de la confirmation vocale

Pour les tools marqués comme irréversibles (`send_whatsapp`, `send_email`, `update_crm`), l'orchestrateur doit :

1. Intercepter le tool call avant exécution
2. Générer un message de confirmation via TTS : "Je vais envoyer le résumé par WhatsApp. Je confirme ?"
3. Passer le device en état LISTENING pour capter la réponse
4. Transcrire la réponse (STT)
5. Si "oui" / "confirme" / "envoie" → exécuter le tool et continuer la boucle
6. Si "non" / "annule" → renvoyer au LLM un tool_result d'annulation
7. Si autre chose → demander clarification

Timeout de confirmation : 15 secondes. Si pas de réponse → annuler et informer l'utilisateur.

### 8.5 System prompt de l'agent

```
Tu es AURA, un assistant IA vocal professionnel permanent.
Tu es intégré dans une enceinte physique qui écoute en continu l'environnement de l'utilisateur.
Tu as accès à une mémoire contextuelle de tout ce qui a été dit autour de toi.

Date et heure actuelles : {current_datetime}
Timezone : {timezone}
Utilisateur : {user_name}

Tes capacités :
- Retrouver n'importe quelle information de conversations passées
- Résumer des réunions avec décisions et action items
- Envoyer des messages (WhatsApp, email)
- Plus de fonctions à venir

Règles :
1. Réponds en français sauf demande contraire
2. Sois CONCIS — tes réponses sont lues à voix haute, pas affichées sur écran
3. Quand tu utilises la mémoire, cite la date et le contexte ("mardi après-midi, pendant votre call avec X...")
4. AVANT toute action irréversible (envoi message, email), décris ce que tu vas faire et demande confirmation
5. Si tu ne trouves pas l'info dans la mémoire, dis-le honnêtement
6. Pour les recherches temporelles, utilise d'abord get_recent_context si c'est récent (< 3h), sinon search_memory avec les bons filtres
7. Si la demande est ambiguë, pose UNE question de clarification courte
```

### 8.6 Fichiers à créer

```
app/
├── core/
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── loop.py             # La boucle agent principale
│   │   ├── tools.py            # Définition + registry des tools
│   │   ├── tool_executor.py    # Exécution des tools (dispatch)
│   │   ├── confirmation.py     # Gestion confirmation vocale
│   │   └── session.py          # État de session d'interaction (Redis)
│   ├── llm.py                  # Client LLM (Anthropic API) avec function calling
```

---

## 9. Structure complète du projet

```
aura-backend/
├── app/
│   ├── __init__.py
│   ├── main.py                      # FastAPI app, lifespan, middleware
│   ├── config.py                    # Settings Pydantic (env vars)
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py            # GET /health
│   │       ├── auth.py              # POST /auth/register, /auth/login
│   │       ├── ws_audio.py          # WebSocket /ws/audio-stream
│   │       ├── meetings.py          # CRUD réunions (dashboard)
│   │       ├── actions.py           # POST /actions/chat, /actions/execute
│   │       ├── memory.py            # POST /memory/search (dashboard)
│   │       └── dev.py               # Endpoints de simulation (dev only)
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── stt.py                   # Whisper API wrapper
│   │   ├── tts.py                   # ElevenLabs wrapper + streaming
│   │   ├── vad.py                   # Silero VAD wrapper
│   │   ├── diarization.py           # pyannote.audio wrapper
│   │   ├── audio_stream.py          # Gestion flux WebSocket audio
│   │   ├── transcript_manager.py    # Batching, horodatage absolu
│   │   ├── temporal_parser.py       # Parsing références temporelles
│   │   ├── response_streamer.py     # Coordination LLM→TTS→WebSocket
│   │   ├── llm.py                   # Client Anthropic avec function calling
│   │   │
│   │   ├── memory/
│   │   │   ├── __init__.py
│   │   │   ├── buffer.py            # Couche 1 Redis
│   │   │   ├── compaction.py        # Compaction couche 1→2
│   │   │   ├── condensation.py      # Condensation couche 2→3
│   │   │   ├── search.py            # Recherche hybride
│   │   │   ├── context_builder.py   # Assemblage contexte pour LLM
│   │   │   └── embeddings.py        # OpenAI embeddings wrapper
│   │   │
│   │   └── agent/
│   │       ├── __init__.py
│   │       ├── loop.py              # Agent loop principal
│   │       ├── tools.py             # Définitions des tools
│   │       ├── tool_executor.py     # Dispatch et exécution
│   │       ├── confirmation.py      # Confirmation vocale
│   │       └── session.py           # Session state (Redis)
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── database.py              # SQLAlchemy models
│   │   └── schemas.py               # Pydantic request/response
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   └── session.py               # Async SQLAlchemy + pgvector
│   │
│   └── workers/
│       ├── __init__.py
│       ├── celery_app.py            # Config Celery
│       ├── compaction_worker.py     # Worker de compaction
│       └── condensation_worker.py   # Worker de condensation hebdo
│
├── tests/
│   ├── test_stt.py
│   ├── test_agent_loop.py
│   ├── test_memory_search.py
│   ├── test_compaction.py
│   └── test_temporal_parser.py
│
├── docker-compose.yml               # PG + pgvector + Redis + API + Celery
├── Dockerfile
├── requirements.txt
├── .env.example
├── alembic.ini                       # Migrations DB
├── alembic/
│   └── versions/
└── README.md
```

---

## 10. Variables d'environnement requises

```env
# App
DEBUG=true
SECRET_KEY=<random-string>

# Database
DATABASE_URL=postgresql+asyncpg://aura:secret@localhost:5432/aura_db

# Redis
REDIS_URL=redis://localhost:6379/0

# STT (OpenAI Whisper API)
OPENAI_API_KEY=sk-...

# LLM (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-20250514
LLM_MODEL_LIGHT=claude-haiku-4-5-20251001

# TTS (ElevenLabs)
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...

# Embeddings
EMBEDDING_MODEL=text-embedding-3-small

# Wake Word (Picovoice)
PORCUPINE_ACCESS_KEY=...

# Auth
JWT_SECRET=<random-string>

# WhatsApp Business API (MVP)
WHATSAPP_API_TOKEN=...
WHATSAPP_PHONE_ID=...

# Email SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
```

---

## 11. Ordre d'implémentation recommandé

### Sprint 1 (Semaine 1-2) — Le pipeline audio de base

1. Setup projet (FastAPI + Docker Compose + PG + Redis)
2. `stt.py` — Wrapper Whisper API
3. `ws_audio.py` — Endpoint WebSocket pour recevoir l'audio
4. `audio_stream.py` — Gestion du flux audio entrant
5. `transcript_manager.py` — Batching + horodatage absolu
6. `buffer.py` — Stockage dans Redis couche 1
7. Tests : envoyer un fichier audio → vérifier la transcription horodatée dans Redis

### Sprint 2 (Semaine 3-4) — La mémoire contextuelle

8. `embeddings.py` — Wrapper OpenAI embeddings
9. `compaction.py` — Job de compaction (LLM + chunking + embeddings)
10. `search.py` — Recherche hybride pgvector
11. `temporal_parser.py` — Parsing des références temporelles
12. `context_builder.py` — Assemblage du contexte
13. Worker Celery pour la compaction
14. Tests : simuler 2h de transcription → compacter → rechercher "le prix du fournisseur"

### Sprint 3 (Semaine 5-6) — L'agent et les actions

15. `llm.py` — Client Anthropic avec function calling
16. `tools.py` — Définitions des tools MVP
17. `tool_executor.py` — Exécution des tools
18. `loop.py` — Agent loop
19. `tts.py` — ElevenLabs streaming
20. `response_streamer.py` — Pipeline LLM → TTS → WebSocket
21. Endpoint simulation wake word + commande
22. Tests : simuler "résume la réunion de tout à l'heure" → vérifier le résumé

### Sprint 4 (Semaine 7-8) — Intégrations et polish

23. `send_whatsapp` tool (WhatsApp Business API)
24. `send_email` tool (SMTP)
25. `confirmation.py` — Confirmation vocale
26. `condensation.py` — Job hebdomadaire couche 3
27. Tests end-to-end complets
28. Documentation API (Swagger auto)

---

## 12. Critères de validation

| Critère | Cible | Comment mesurer |
|---------|-------|-----------------|
| STT accuracy (WER) | < 10% | Comparer transcriptions Whisper avec texte de référence |
| Latence STT commande | < 1.5s | Timer entre fin de parole et transcription disponible |
| Latence agent loop complète | < 5s | Timer entre commande vocale et début de réponse TTS |
| Précision recherche mémoire | > 80% | Sur 20 requêtes test, le bon contexte est dans le top 5 |
| Parsing temporel | > 90% | Sur 30 expressions temporelles FR, le bon créneau est identifié |
| Compaction sans perte | 100% des chiffres et noms propres conservés | Vérification manuelle sur 10 compactions |
| Ratio compression compaction | 5:1 à 10:1 | tokens bruts / tokens structurés |
| Uptime WebSocket | > 99% | Connexion maintenue sur 8h de test continu |

---

*Ce document est le cahier des charges technique complet pour le pipeline audio d'AURA.
Il est conçu pour être donné directement à Claude Code comme contexte d'implémentation.
Chaque module, chaque format de données, chaque choix technique y est spécifié.*

*CONFIDENTIEL — HALLIA · AURA v1.0*
