# TuniOptique AI Agent — Rapport Technique Complet

> Agent commercial intelligent pour une boutique tunisienne spécialisée en optique et instruments médicaux.

---

## Table des matières

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Architecture générale](#2-architecture-générale)
3. [Stack technologique](#3-stack-technologique)
4. [Couche de données — SQLite](#4-couche-de-données--sqlite)
5. [Agent IA — Moteur central](#5-agent-ia--moteur-central)
6. [Système de mémoire de session](#6-système-de-mémoire-de-session)
7. [Initialisation intelligente de session](#7-initialisation-intelligente-de-session)
8. [Les 16 outils de l'agent](#8-les-16-outils-de-lagent)
9. [Catalogue produits local](#9-catalogue-produits-local)
10. [Identification client & suivi visiteur](#10-identification-client--suivi-visiteur)
11. [Flux de commande complet](#11-flux-de-commande-complet)
12. [Widget d'intégration](#12-widget-dintégration)
13. [Interface Chat (frontend)](#13-interface-chat-frontend)
14. [Dashboard Admin](#14-dashboard-admin)
15. [Import & Webhook](#15-import--webhook)
16. [Routes & API HTTP](#16-routes--api-http)
17. [Configuration & Variables d'environnement](#17-configuration--variables-denvironnement)
18. [Décisions techniques clés](#18-décisions-techniques-clés)

---

## 1. Vue d'ensemble du projet

TuniOptique AI Agent est une application web Flask qui expose un **chat commercial intelligent** alimenté par GPT-4o. L'agent peut :

- **Identifier automatiquement** les clients par leur numéro de téléphone et personnaliser toute la conversation.
- **Rechercher et recommander** des produits depuis un catalogue local synchronisé avec l'API TikTakPro.
- **Créer des commandes** complètes avec récapitulatif, confirmation et numéro de commande.
- **Suivre les livraisons** en temps réel via JAX Delivery.
- **Afficher les factures** et générer des devis détaillés.
- **Escalader** vers un agent humain quand nécessaire.
- **Tracker les visiteurs** du site web avant même qu'ils aient un compte client.
- S'intégrer dans n'importe quel site web en une seule ligne de code (`<script>` tag).

---

## 2. Architecture générale

```
┌─────────────────────────────────────────────────────────────────┐
│                        SITE WEB CLIENT                          │
│   ┌──────────────────────────────────────────────────────┐     │
│   │  widget.js  (script embarqué — 1 tag <script>)       │     │
│   │  • génère/restaure visitor_id (localStorage)         │     │
│   │  • affiche bouton flottant + iframe panel            │     │
│   │  • écoute postMessage depuis l'iframe               │     │
│   └────────────────────────┬─────────────────────────────┘     │
└────────────────────────────│────────────────────────────────────┘
                             │ HTTP / iframe src
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FLASK APPLICATION                           │
│                                                                 │
│  Routes Chat          Routes Admin          Routes Webhook      │
│  /api/visitor/init    /admin                /webhook/orders     │
│  /api/session/new     /admin/products       /webhook/orders/test│
│  /api/chat            /fulfillment                              │
│  /api/session/identify /demo                                    │
│         │                    │                                  │
│         ▼                    ▼                                  │
│  ┌─────────────────┐  ┌─────────────────────────────────┐      │
│  │  AGENT CORE     │  │         ADMIN STORE             │      │
│  │  GPT-4o         │  │  orders_store / notifications   │      │
│  │  tool_choice    │  │  importer / product_sync        │      │
│  │  agentic loop   │  └─────────────────────────────────┘      │
│  └────────┬────────┘                                           │
│           │  tool calls                                        │
│           ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐       │
│  │                   16 TOOLS                          │       │
│  │  get_customer_profile  │  search_products           │       │
│  │  get_recommended_products│ verify_product_live      │       │
│  │  prepare_order_recap   │  create_order              │       │
│  │  check_delivery_status │  get_invoice               │       │
│  │  generate_quote        │  escalate_to_human …       │       │
│  └───────┬────────────────┴────────────────────────────┘       │
│          │                                                      │
│          ▼                                                      │
│  ┌───────────────────────────────────────────────────────┐      │
│  │  SQLite (WAL mode) — tunioptique.db                   │      │
│  │  customers │ orders │ order_items │ products          │      │
│  │  products_cache │ visitors │ fulfillment_history      │      │
│  └───────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
          │                  │                    │
          ▼                  ▼                    ▼
    TikTakPro API      TikTak Space API     JAX Delivery API
    (catalogue)        (commandes/factures) (suivi livraison)
```

---

## 3. Stack technologique

| Composant | Technologie | Rôle |
|---|---|---|
| Backend | Python 3.11 + Flask | Serveur web, routes REST |
| IA | OpenAI GPT-4o | Compréhension, génération, tool use |
| Base de données | SQLite 3 (mode WAL) | Persistence locale (clients, commandes, produits) |
| Frontend chat | HTML + CSS + JS vanilla | Interface utilisateur chat style WhatsApp |
| Plugin widget | JS vanilla (IIFE) | Intégration dans sites externes |
| API produits | TikTakPro REST | Catalogue, prix, stock |
| API commandes | TikTak Space REST | Création commandes, factures |
| API livraison | JAX Delivery REST | Suivi colis en temps réel |
| Config | python-dotenv | Variables d'environnement (.env) |

---

## 4. Couche de données — SQLite

### 4.1 Schéma des tables

**`customers`** — Base clients CRM locale
```sql
phone        TEXT PRIMARY KEY   -- numéro tunisien (ex: 22334455)
name         TEXT
email        TEXT
gouvernorat  TEXT
address      TEXT
tag          TEXT DEFAULT 'Nouveau client'   -- Nouveau / Régulier / Fidèle / VIP / À risque
total_orders INTEGER DEFAULT 0
total_spent  REAL    DEFAULT 0
created_at   TEXT
updated_at   TEXT
```

**`orders`** — Toutes les commandes (import + webhook + chat)
```sql
id              TEXT PRIMARY KEY  -- UUID interne
source          TEXT              -- 'import' | 'webhook' | 'chat'
external_id     INTEGER           -- ID TikTak Space
customer_phone  TEXT              -- FK → customers
customer_name   TEXT
address         TEXT
gouvernorat     TEXT
status          TEXT              -- pipeline statut
payment_type    TEXT DEFAULT 'CASH'
total           REAL
comment         TEXT
tracking_number TEXT              -- numéro JAX
created_at      TEXT
updated_at      TEXT
```

**`order_items`** — Lignes de commande
```sql
id           INTEGER PRIMARY KEY AUTOINCREMENT
order_id     TEXT    -- FK → orders
product_id   INTEGER
product_name TEXT
quantity     INTEGER DEFAULT 1
price_ttc    REAL
discount     REAL
final_price  REAL
```

**`products`** — Catalogue local synchronisé depuis TikTakPro
```sql
id            INTEGER PRIMARY KEY   -- ID TikTakPro
name          TEXT
description   TEXT                  -- HTML strippé, max 1000 chars
category_id   INTEGER
category_name TEXT
price         REAL
price_ht      REAL
taxe_rate     REAL
discount      REAL
discount_type TEXT   -- 'fixed_amount' | 'percentage'
price_final   REAL   -- prix calculé après remise
stock         INTEGER
in_stock      INTEGER  -- 0/1
active        INTEGER  -- 0/1
photo         TEXT     -- URL image principale
photo_thumb   TEXT
features      TEXT     -- JSON array de strings
variants      TEXT     -- JSON array de déclinaisons
seo_slug      TEXT
sold          INTEGER DEFAULT 0
api_updated_at TEXT
synced_at     TEXT    -- dernière synchronisation locale
```

**`visitors`** — Suivi des visiteurs anonymes du site web
```sql
visitor_id     TEXT PRIMARY KEY   -- UUID navigateur (tuno_vid)
customer_phone TEXT               -- NULL jusqu'à conversion
first_seen     TEXT
last_seen      TEXT
page_views     INTEGER DEFAULT 1
chat_sessions  INTEGER DEFAULT 0
referrer       TEXT
user_agent     TEXT
is_converted   INTEGER DEFAULT 0  -- 1 quand lié à un compte client
INDEX: idx_visitors_phone ON visitors(customer_phone)
```

**`fulfillment_history`** — Historique des transitions de statut
```sql
id         INTEGER PRIMARY KEY AUTOINCREMENT
order_id   TEXT
from_status TEXT
to_status   TEXT
note        TEXT
tracking    TEXT
changed_at  TEXT
```

**`products_cache`** — Cache léger des produits vus dans les commandes historiques
```sql
id         INTEGER PRIMARY KEY  -- product_id
name       TEXT
category   TEXT
photo      TEXT
updated_at TEXT
```

### 4.2 Fonction `normalize()` SQLite personnalisée

Tous les `get_conn()` enregistrent une fonction scalaire `normalize(text)` :

```python
def _sqlite_normalize(s: str) -> str:
    return unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode("ascii").lower()

conn.create_function("normalize", 1, _sqlite_normalize)
```

Cette fonction est utilisée dans toutes les requêtes LIKE pour rendre la recherche **insensible aux accents** : `normalize("Télescope") == normalize("telescope") == "telescope"`.

### 4.3 Pipeline fulfillment — Statuts et transitions

```
En attente → Confirmées → Prêt à expédier → Expédiées → Livrées
     │                                                       │
     └──────────────────────────────────────────────────►Annulées
                                                        Retournées
                                                        Remboursées
```

Les statuts terminaux (`Livrées`, `Annulées`, `Retournées`, `Remboursées`, `Payées`) ne peuvent plus évoluer.

---

## 5. Agent IA — Moteur central

**Fichier :** `app/agent/core.py`

### 5.1 Prompt système dynamique

Le système prompt est reconstruit à chaque appel API pour injecter les données client connues :

```
[BASE PROMPT statique]
  ↓
[PROFIL CLIENT CONNU] — si client identifié en session
  Nom, téléphone, adresse, gouvernorat, tag CRM
  ↓
[COMMANDES ACTIVES] — si commandes non livrées en mémoire
  Pour chaque commande : statut, items, tracking
  Instructions proactives selon statut
```

Le prompt statique couvre :
- Liste des 16 outils disponibles
- Règle d'identification prioritaire (demander le téléphone en premier)
- Processus de commande en 5 étapes
- Règles obligatoires sur l'utilisation du catalogue local
- Style de communication (concis, direct)

### 5.2 Boucle agentique (agentic loop)

```python
# 1. Premier appel GPT
response = client.chat.completions.create(model, messages, tools, tool_choice="auto")

# 2. Boucle tant que GPT demande des tool calls
while assistant_message.tool_calls:
    for tool_call in assistant_message.tool_calls:
        # a) Injecter le contexte session dans les args (create_order, prepare_order_recap…)
        # b) Appeler le handler correspondant
        result = TOOL_HANDLERS[fn_name](fn_args)
        # c) Post-traitement : enrichir la session si nécessaire
        #    ex: get_customer_profile → update_customer_info + set_active_orders
        # d) Reconstruire le prompt (le profil client est maintenant plus riche)
    
    # Nouvel appel GPT avec les résultats des outils
    response = client.chat.completions.create(...)

# 3. Réponse finale + payload UI structuré
return {reply, products, product, order_recap, order_result, customer, ...}
```

### 5.3 Post-traitements automatiques par outil

| Outil appelé | Post-traitement |
|---|---|
| `get_customer_profile` | `update_customer_info()` + `set_active_orders()` + chargement de l'adresse depuis DB |
| `get_pending_orders` | `set_active_orders()` |
| `prepare_order_recap` | `save_pending_recap()` + `update_customer_info()` |
| `create_order` | `clear_pending_recap()` + `mark_has_order()` |
| `escalate_to_human` | `mark_has_escalation()` |

### 5.4 Fallback par mots-clés

En parallèle de la boucle agentique, le moteur détecte des mots-clés dans le message utilisateur pour déclencher des rendus UI même si GPT n'a pas appelé l'outil :

- `livraison`, `délai`, `frais` → `get_delivery_info()` (avec détection du gouvernorat par regex)
- `facture`, `reçu`, `invoice` → `get_invoice()` (avec extraction du numéro de commande/téléphone par regex)
- `devis`, `estimation` → `generate_quote()` (avec extraction des IDs produits et quantités par regex)

### 5.5 Payload de retour UI

L'agent retourne un dictionnaire structuré que le frontend interprète pour afficher des composants enrichis :

```json
{
  "reply": "Texte de la réponse de l'agent",
  "products": [...],        // liste produits → carrousel de cartes
  "product": {...},         // détail produit → fiche complète
  "order_recap": {...},     // récapitulatif → carte de confirmation
  "order_result": {...},    // commande créée → carte de succès
  "customer": {...},        // profil CRM → carte client
  "pending_orders": {...},  // commandes en cours → liste avec bouton tracking
  "delivery": {...},        // zones de livraison → tableau tarifaire
  "invoice": {...},         // facture → carte détaillée
  "quote": {...}            // devis → carte avec totaux
}
```

---

## 6. Système de mémoire de session

**Fichier :** `app/agent/memory.py`

La mémoire est **en RAM** (dict Python), ce qui garantit des réponses ultra-rapides. Elle est keyed par `session_id` (UUID).

### Structure d'une session

```python
{
    "messages":       [],        # historique GPT complet (user/assistant/tool)
    "created_at":     "...",
    "last_activity":  "...",
    "customer": {                # profil client enrichi progressivement
        "name": "", "phone": "", "address": "", 
        "gouvernorat": "", "tag": "", "email": ""
    },
    "active_orders":  [],        # commandes non livrées → injectées dans le prompt
    "has_order":      False,     # booléen pour le dashboard
    "has_escalation": False,
    "pending_recap":  {},        # dernière prépare_order_recap en attente
    "visitor_id":     "",        # lien avec la table visitors
}
```

### Limites et TTL

- Historique limité à **50 messages** (les plus anciens sont supprimés)
- La mémoire est **perdue au redémarrage** du serveur — acceptable car les données persistantes (clients, commandes) sont dans SQLite

---

## 7. Initialisation intelligente de session

**Fichier :** `app/agent/session_init.py`

Quand un client arrive avec un numéro de téléphone connu, l'initialisation se fait en 4 étapes avant que le client écrive son premier message :

### Étape 1 — `build_client_context(phone)`

Charge depuis SQLite :
- Profil client complet
- 20 dernières commandes
- Classifie les commandes : actives / livrées / en transit
- Calcul des jours depuis la dernière commande
- Historique des produits achetés (noms uniques)

### Étape 2 — `_determine_proactive_action()`

Choisit l'action la plus pertinente à mentionner en premier selon cette priorité :

| Priorité | Condition | Action |
|---|---|---|
| 1 | Commande en transit (statut "Expédiées") | Suivi livraison |
| 2 | Commande confirmée en attente d'expédition | Rassurer sur le délai |
| 3 | Commande en attente de confirmation | Proposer de confirmer |
| 4 | Livraison récente (< 14 jours) | Demander un avis |
| 5 | Historique d'achats | Proposer des produits complémentaires |
| 6 | Nouveau/inactif | Accueil chaleureux |

### Étape 3 — `inject_into_session(session_id, ctx)`

Stocke toutes les données client dans la mémoire de session pour que le prompt système les inclue immédiatement.

### Étape 4 — `generate_greeting(session_id, ctx)`

Appelle GPT avec un prompt spécialisé pour générer un message d'accueil personnalisé de 2-3 phrases maximum, adapté au tag CRM (ton différent pour Nouveau client vs VIP vs Client à risque).

---

## 8. Les 16 outils de l'agent

**Fichier :** `app/agent/tools.py`

### Outils CRM & Commandes

| Outil | Description |
|---|---|
| `get_customer_profile(phone)` | Profil complet depuis SQLite + API TikTak Space. Retourne historique, dépenses, tag, commandes actives, recommandation hint. |
| `get_pending_orders(phone)` | Toutes les commandes non livrées d'un client, groupées par statut. |
| `get_order_details(phone?, order_id?)` | Détails d'une commande spécifique depuis l'API TikTak Space. |
| `create_order(...)` | Crée la commande via API TikTak Space. Auto-remplit les champs connus depuis la session. |

### Outils Produits

| Outil | Description |
|---|---|
| `get_categories()` | Liste toutes les catégories du catalogue local avec le nombre de produits. |
| `search_products(query, category_id?, max_price?, in_stock_only?, limit?)` | Recherche locale avec ranking par pertinence. Fallback API si catalogue vide. Recherche insensible aux accents. |
| `get_recommended_products(phone, limit?)` | Produits complémentaires basés sur l'historique d'achat du client (même catégories). Fallback sur les populaires. |
| `get_product_details(product_id)` | Fiche produit complète : description, variantes, caractéristiques, prix, stock. |
| `verify_product_live(product_id)` | Vérifie prix ET stock en temps réel via l'API TikTakPro. Met à jour le cache local. Retourne une alerte si le prix a changé. |
| `compare_products(product_ids[])` | Compare 2-3 produits côte à côte (prix, stock, specs). |

### Outils Commande & Logistique

| Outil | Description |
|---|---|
| `prepare_order_recap(items[], customer_name, phone, address, gouvernorat)` | Construit le récapitulatif de commande. Pour chaque produit : vérifie le prix en live si le cache est > 60 min. Bloque les produits hors stock. |
| `get_delivery_info(gouvernorat?)` | Zones, délais et tarifs de livraison JAX par gouvernorat. |
| `check_delivery_status(tracking_number)` | Suivi en temps réel d'un colis JAX. |

### Outils Finance

| Outil | Description |
|---|---|
| `get_invoice(order_id?, phone?)` | Récupère la facture depuis l'API TikTak Space. |
| `generate_quote(items[])` | Génère un devis détaillé avec HT, TVA, remises, et total TTC. |

### Outil Escalade

| Outil | Description |
|---|---|
| `escalate_to_human(reason, summary, session_id, customer)` | Crée une notification admin. Déclenché pour plaintes, remboursements, ou problèmes complexes. |

---

## 9. Catalogue produits local

**Fichier :** `app/product_sync.py`

### Stratégie Local-First

```
Client demande un produit
        │
        ▼
search_products_local()  ← SQLite, < 5ms
        │
   Résultats trouvés ? ──NON──► Fallback API TikTakPro
        │ OUI
        ▼
   Age du cache > 60 min ?  (pendant prepare_order_recap)
        │ OUI
        ▼
   verify_product_live()  ← API en temps réel
   refresh_product_from_api()  ← mise à jour SQLite
```

### Synchronisation automatique

Au démarrage de l'application (`app/__init__.py`), deux mécanismes sont lancés en threads daemon :

**`maybe_sync_on_startup()`**
- Si le catalogue est **vide** → sync complet
- Si le dernier sync date de plus de `PRODUCT_SYNC_STALE_HOURS` (défaut: 12h) → sync incrémental
- Sinon → aucune action

**`start_scheduler()`**
- Lance un sync incrémental automatique toutes les `PRODUCT_SYNC_INTERVAL_HOURS` heures (défaut: 6h)

### Types de sync

| Type | Paramètre API | Action |
|---|---|---|
| Complet | aucun | Upsert tous les produits actifs |
| Incrémental | `updated_after=<dernière synced_at>` | Upsert uniquement les produits modifiés depuis le dernier sync |

### Calcul du prix final

```python
if discount > 0:
    if discount_type == "fixed_amount":
        price_final = max(0, price - discount)
    elif discount_type == "percentage":
        price_final = round(price * (1 - discount / 100), 2)
else:
    price_final = price
```

---

## 10. Identification client & suivi visiteur

### 10.1 Cycle de vie d'un visiteur

```
1ère visite sur le site
        │
        ▼
widget.js génère visitor_id (UUID) → stocké dans localStorage['tuno_vid']
        │
        ▼
POST /api/visitor/init → création dans table visitors
        │
Chat ouvert → POST /api/session/new { visitor_id }
        │
        ▼
Requête DB: visitors → customer_phone → auto-identification si déjà converti
        │
Le client donne son téléphone → get_customer_profile() appelé
        │
        ▼
POST /api/chat détecte que le client était anonyme + est maintenant identifié
        │
db.convert_visitor(visitor_id, phone) → is_converted=1, customer_phone=phone
        │
        ▼
Prochaine visite : auto-identification sans téléphone
```

### 10.2 Détection de téléphone en temps réel

Dans chaque message utilisateur, un regex cherche un numéro de téléphone tunisien :

```python
_PHONE_RE = re.compile(r'\b([259]\d{7})\b')
```

Si trouvé et si la session est encore anonyme → `build_client_context()` + `inject_into_session()` silencieusement.

### 10.3 Auto-remplissage des commandes

Quand un client est identifié, tous ses champs connus (nom, adresse, gouvernorat) sont injectés automatiquement dans les appels `prepare_order_recap` et `create_order`. L'agent n'a jamais besoin de re-demander ces informations.

---

## 11. Flux de commande complet

```
Client : "Je veux commander le télescope Celestron"
        │
        ▼
Agent → search_products("celestron telescope")
Agent → "Voici le Celestron StarSense LT 80AZ à 649 TND. Vous le souhaitez ?"
        │
Client : "Oui, 1 unité"
        │
        ▼
Agent → prepare_order_recap({
    items: [{product_id: 1270464, quantity: 1}],
    customer_name: "Ahmed Ben Ali",   ← auto-rempli depuis session
    phone: "22334455",                ← auto-rempli
    address: "Rue X, Tunis",          ← auto-rempli
    gouvernorat: "Tunis"              ← auto-rempli
})
        │
        ▼ (si synced_at > 60 min)
verify_product_live(1270464) → prix: 649 TND, stock: 10 ✓
        │
        ▼
recap_ready: true → Frontend affiche la carte récapitulative

Agent : "Voici votre récapitulatif : 1x Celestron LT 80AZ — 649 TND
         Livraison Tunis : 8 TND. Total : 657 TND. Confirmer ?"
        │
Client : "Oui confirmer"
        │
        ▼
Agent → create_order({...}) → API TikTak Space
        │
Retour: order_id: #123456
        │
        ▼
Frontend affiche la carte de succès + le numéro de commande
DB: upsert_order() + refresh_customer_stats()
```

---

## 12. Widget d'intégration

**Fichier :** `app/static/js/widget.js`

### Intégration côté client (1 ligne)

```html
<script
  src="https://votre-serveur.com/static/js/widget.js"
  data-server="https://votre-serveur.com"
  data-color="#00a884"
  data-position="bottom-right">
</script>
```

### Fonctionnement interne

```
Page chargée
    │
widget.js s'exécute (IIFE auto-invoquée)
    │
1. Lit visitor_id depuis localStorage['tuno_vid'] (ou génère + stocke)
    │
2. POST /api/visitor/init → enregistre visite + récupère customer_phone si connu
    │
3. Injecte les styles CSS (bouton flottant + panel iframe)
    │
4. Crée le bouton flottant + panel vide (lazy-load iframe)
    │
Clic sur bouton → _openPanel()
    │
    └─► 1er clic : construit l'URL iframe
        src = "/?widget=1&vid=<visitorId>&phone=<phone si connu>"
    │
    └─► Iframe chargée → chat.js s'exécute en mode widget
```

### Communication cross-frame (postMessage)

| Message (iframe → parent) | Déclencheur | Action parent |
|---|---|---|
| `TUNO_IDENTIFIED { phone }` | Client identifié dans le chat | Stocke `customer_phone` dans localStorage |
| `TUNO_CLOSE` | Client clique sur fermer dans l'iframe | Ferme le panel |
| `TUNO_UNREAD { count }` | Nouveau message non lu | Affiche le badge rouge sur le bouton |

### API publique

```javascript
window.TuniOptiqueWidget = {
    open(),       // ouvrir le chat
    close(),      // fermer le chat
    toggle(),     // basculer ouverture/fermeture
    visitorId,    // accès au visitor_id courant
}
```

### Mode responsive

- Desktop : panel 390×620px, bouton en position fixe
- Mobile (< 480px) : panel en plein écran 100vw×100vh

---

## 13. Interface Chat (frontend)

**Fichiers :** `app/static/css/chat.css`, `app/static/js/chat.js`, `templates/index.html`

### Design

Interface style **WhatsApp Business** — fond sombre (#0b141a), bulles vertes pour l'utilisateur, grises pour l'agent, avec support Markdown dans les réponses (via `marked.js`).

### Composants UI enrichis

Le frontend interprète le payload de retour de l'agent et affiche des composants visuels selon le type de données :

| Données retournées | Composant affiché |
|---|---|
| `products[]` | Carrousel de cartes produit scrollable horizontalement (photo, nom, prix, stock, bouton Commander) |
| `product{}` | Fiche produit complète (image, description, variants, stock live) |
| `customer{}` | Carte profil client (avatar, nom, tag, stats, derniers achats) |
| `pending_orders{}` | Carte commandes en cours (statut, items, total, bouton Suivi) |
| `order_recap{}` | Récapitulatif de commande avec boutons Confirmer / Modifier |
| `order_result{}` | Carte de confirmation avec numéro de commande |
| `delivery{}` | Tableau des zones et tarifs de livraison |
| `invoice{}` | Carte facture avec tableau des lignes |
| `quote{}` | Devis détaillé HT/TVA/TTC |

### Mode widget (iframe)

Quand l'URL contient `?widget=1`, le JS ajoute la classe `widget-mode` sur `<html>` et `<body>` :
- Reset du layout flex de centrage
- `height: 100%` pour remplir l'iframe exactement
- Suppression des `border-radius` et `box-shadow`
- Bouton "✕ Fermer" dans le header envoie `TUNO_CLOSE` au parent via postMessage

---

## 14. Dashboard Admin

**Routes :** `/admin`, `/admin/products`, `/fulfillment`, `/demo`

### Page Statistiques (`/admin`)

**KPIs en temps réel (refresh 15s) :**
- Conversations totales / aujourd'hui
- Commandes reçues / aujourd'hui
- Chiffre d'affaires (TND) / aujourd'hui
- Taux de conversion (conversations → commandes)
- Commandes en attente
- Escalades pendantes
- Messages envoyés
- Commandes confirmées
- Top 5 gouvernorats (graphe à barres)

**Onglets :**
- 📊 Statistiques — KPIs + graphes
- 📦 Commandes — liste avec recherche, confirmation/annulation, export CSV
- 👥 Clients — base clients avec recherche, total dépensé, tag
- 💬 Conversations — historique des sessions, messages, statut
- 🚨 Escalades — alertes agent humain à traiter
- ⬇ Import & Webhook — import historique + config webhook

### Page Fulfillment (`/fulfillment`)

Pipeline de traitement des commandes importées depuis TikTak Space :
- Vue kanban par statut (En attente → Confirmées → Expédiées → Livrées)
- Transition de statut en 1 clic avec note et numéro de tracking
- Filtres par gouvernorat, recherche par nom/téléphone
- Panneau de détail avec historique des transitions

### Page Catalogue Produits (`/admin/products`)

- Statistiques du catalogue (total, en stock, hors stock, catégories, dernier sync)
- Contrôle du sync (Sync complet / Incrémental) avec barre de progression et logs en live
- Grille de produits avec recherche accent-insensible, filtre catégorie, filtre stock
- Pagination configurable (24/48/96 par page)
- Modal détail produit : image, prix, déclinaisons, caractéristiques, produits similaires

### Page Démo (`/demo`)

Simulation complète d'un site e-commerce avec le widget intégré pour tests :
- **Faux site TuniOptique** avec navbar, hero, 6 fiches produits cliquables (ouvrent le chat avec contexte)
- **Panneau de test** (dépliable) :
  - Configuration widget (serveur, couleur, position) avec rechargement à chaud
  - État visiteur/session en temps réel (localStorage)
  - Actions rapides : nouveau visiteur, injecter client, vider localStorage
  - 5 scénarios de test prédéfinis
  - Log des événements postMessage
  - Inspecteur localStorage
  - Code d'intégration prêt à copier

---

## 15. Import & Webhook

### Import historique

**Fichier :** `app/importer.py`

Importe l'historique complet des commandes depuis TikTak Space en background thread :

```
GET /api/v1/orders/?page=N&limit=50
    │
    ▼
Pour chaque commande :
    upsert_customer() → clients
    cache_product()   → products_cache
    upsert_order()    → orders + order_items
    │
    ▼
refresh_customer_stats() pour tous les clients
```

Suivi de progression accessible via `GET /api/admin/import/status`.

### Webhook temps réel

**Fichier :** `app/routes/webhook.py`

TikTak Space envoie un `POST /webhook/orders` à chaque nouvelle commande.

Authentification : header `X-Webhook-Token: <WEBHOOK_SECRET>`.

Traitement :
1. Upsert client
2. Cache produits
3. Upsert commande
4. Refresh stats client
5. Création notification admin (visible dans le badge rouge du dashboard)

Un endpoint de test `POST /webhook/orders/test` permet de simuler une réception sans authentification (développement).

---

## 16. Routes & API HTTP

### Chat

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Interface chat (index.html) |
| POST | `/api/visitor/init` | Enregistre/met à jour un visiteur |
| POST | `/api/session/new` | Crée une session, greeting personnalisé |
| POST | `/api/chat` | Envoie un message, retourne la réponse + UI payload |
| POST | `/api/session/identify` | Identifie un client en cours de session |
| GET | `/api/sessions` | Liste toutes les sessions actives |

### Admin

| Méthode | Route | Description |
|---|---|---|
| GET | `/admin` | Dashboard principal |
| GET | `/admin/products` | Page catalogue produits |
| GET | `/fulfillment` | Pipeline de fulfillment |
| GET | `/demo` | Page de simulation d'intégration |
| GET | `/api/admin/stats` | KPIs globaux |
| GET | `/api/admin/orders` | Liste des commandes |
| POST | `/api/admin/orders/<id>/confirm` | Confirmer une commande |
| POST | `/api/admin/orders/<id>/cancel` | Annuler une commande |
| GET | `/api/admin/orders/export.csv` | Export CSV des commandes |
| GET | `/api/admin/sessions` | Liste des conversations |
| GET | `/api/admin/session/<id>/history` | Historique d'une conversation |
| GET | `/api/admin/notifications` | Escalades admin |
| POST | `/api/admin/notifications/<id>/handle` | Marquer une escalade traitée |
| GET | `/api/admin/customers` | Base clients |
| GET | `/api/admin/products` | Liste paginée du catalogue (search, filtre) |
| GET | `/api/admin/products/<id>` | Détail d'un produit |
| GET | `/api/admin/products/stats` | Statistiques du catalogue |
| POST | `/api/admin/products/sync` | Lancer un sync (complet ou incrémental) |
| GET | `/api/admin/products/sync/status` | Statut du sync en cours |
| POST | `/api/admin/import/start` | Lancer l'import historique |
| GET | `/api/admin/import/status` | Statut de l'import |
| GET | `/api/fulfillment/stats` | Stats du pipeline |
| GET | `/api/fulfillment/orders` | Commandes filtrées par statut |
| POST | `/api/fulfillment/orders/<id>/transition` | Changer le statut d'une commande |
| GET | `/api/fulfillment/orders/<id>/history` | Historique des transitions |

### Webhook

| Méthode | Route | Description |
|---|---|---|
| POST | `/webhook/orders` | Réception commandes TikTak Space (auth requise) |
| POST | `/webhook/orders/test` | Test webhook sans auth |

---

## 17. Configuration & Variables d'environnement

Fichier `.env` (ne jamais committer — protégé par `.gitignore`) :

```env
# OpenAI
OPENAI_API_KEY=sk-proj-...

# TikTakPro — catalogue produits
TIKTAKPRO_TOKEN=...

# TikTak Space — commandes et factures
TIKTAK_SPACE_TOKEN=...

# JAX Delivery — suivi livraison
JAX_API_TOKEN=...

# Webhook
WEBHOOK_SECRET=votre-secret-webhook

# Flask
FLASK_ENV=development
FLASK_SECRET_KEY=votre-secret-flask

# Sync produits (optionnel)
PRODUCT_SYNC_INTERVAL_HOURS=6    # sync incrémental toutes les 6h
PRODUCT_SYNC_STALE_HOURS=12      # sync au démarrage si catalogue > 12h
PRODUCT_LIVE_CHECK_MINUTES=60    # re-vérifier prix/stock si cache > 60 min
```

---

## 18. Décisions techniques clés

### Pourquoi SQLite au lieu d'une base de données serveur ?

SQLite en mode WAL (Write-Ahead Logging) est suffisant pour ce cas d'usage : charge modérée, pas de réplication requise, déploiement simplifié sans dépendances externes. Le mode WAL permet les lectures concurrentes sans bloquer les écritures.

### Pourquoi le catalogue est-il stocké localement ?

L'API TikTakPro a une latence de 200-500ms par requête. Stocker localement les ~1000+ produits permet des recherches en < 5ms. La fraîcheur des prix est garantie uniquement au moment critique (récapitulatif de commande) via `verify_product_live()`.

### Pourquoi la mémoire de session est-elle en RAM et non en SQLite ?

Les sessions de chat sont éphémères et intensément lues/écrites à chaque message. La RAM est 100x plus rapide que SQLite pour ces accès. Les données importantes (clients, commandes) sont toujours persistées en SQLite.

### Pourquoi `tool_choice="auto"` au lieu de forcer les outils ?

GPT-4o avec `tool_choice="auto"` est capable de décider seul quand appeler un outil et quand répondre directement. Forcer un outil à chaque message provoquerait des appels superflus. Le prompt système guide les priorités.

### Pourquoi la recherche produit utilise `normalize()` côté SQLite ?

SQLite's `LOWER()` ne gère pas les caractères accentués (é, è, â…). Enregistrer une fonction Python personnalisée via `create_function()` permet d'appliquer `unicodedata.normalize("NFD")` dans les requêtes SQL sans modifier le schéma. Cela rend "telescope" et "Télescope" équivalents dans toutes les recherches.

### Pourquoi le widget utilise `opacity + pointer-events` au lieu de `display:none` ?

`display:none` appliqué en **inline style** a une priorité CSS maximale et bloque les classes CSS qui tentent de remettre `display:block`. En utilisant `opacity:0 + pointer-events:none` (invisible + non cliquable) pour l'état fermé, et `opacity:1 + pointer-events:auto` (via classe CSS) pour l'état ouvert, on évite tout conflit de spécificité et les transitions CSS fonctionnent correctement à l'ouverture comme à la fermeture.

---

*Rapport généré le 06/06/2026 — TuniOptique AI Agent v1.0*
