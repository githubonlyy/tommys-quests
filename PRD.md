## Project Name: Tommy's Quests (Educational Gamification Tablet App)
**Version:** 1.0
**Target Platform:** Web (Optimized for Landscape Tablet)
**Target Audience:** 3rd-grade student (Israel) and Parents

---

## 1. Executive Summary
**Tommy's Quests** is a tablet-first educational application designed to gamify the daily learning routine of a 3rd-grade student. Utilizing a highly engaging, modern "Brawl Stars" aesthetic (chunky UI, vibrant colors, epic loot styling), the app transforms standard homework (Math, English, Hebrew, Geography) into "Events." By completing events, the student earns in-app currency (Coins) which can only be redeemed for **real-world, physical rewards** (e.g., Lego sets, family activities), strictly avoiding digital video game rewards.

## 2. User Personas
1. **The Player (Tommy - 3rd Grader):** Motivated by gaming progression, XP bars, and unlocking "epic" loot. Needs an interface that feels like a high-end mobile game rather than a school app. 
2. **The Coach (Parent/Admin):** Needs to track the child's academic progress, assign daily tasks, monitor success rates, and manage the fulfillment of real-world rewards.

---

## 3. Core Features & User Stories

### 3.1. Global UI/UX & Navigation
* **Aesthetic:** "Brawl Stars" style. Chunky borders, uppercase italic fonts, vibrant colors, drop shadows, and radial gradients.
* **Header:** Displays Player Avatar, Level/XP progress bar, and real-time Coin balance.
* **Navigation:** Sidebar (or bottom bar on smaller screens) to switch between Events, Shop, and Coach Stats.
* **User Story:** *As a player, I want to see my current level and coins at all times so I know how close I am to my next reward.*

### 3.2. Event Board (The Curriculum)
* **Description:** A grid of daily educational missions categorized by school subjects.
* **Task Types:**
  * **Math Madness (Vault Heist):** Basic arithmetic, division, multiplication.
  * **English Comm (Alien Decode):** Spelling, translation, and vocabulary.
  * **Hebrew Heroes (Ancient Scroll):** Grammar, identifying verbs/nouns, reading comprehension.
  * **Geography (Map Maker / Moledet):** Map reading, coordinates, Israeli geography.
* **Interaction:** Clicking an event opens a modal with a "PLAY!" button. 
* **User Story:** *As a player, I want to select a mission and play a mini-game to earn coins.*

### 3.3. The Shop (Reward Economy)
* **Description:** A marketplace where accumulated coins can be spent.
* **Rules:** Strictly physical/real-world rewards. No Robux, V-Bucks, or screen-time extensions.
* **Item Tiers:**
  * Rare (e.g., Extra serve in Padel - 500 Coins)
  * Epic (e.g., Choose the weekend hike - 1,200 Coins)
  * Legendary (e.g., New Lego Set - 5,000 Coins)
* **Interaction:** Buy buttons must be disabled if funds are insufficient. Successful purchases deduct coins and trigger a success toast.
* **User Story:** *As a player, I want to spend my hard-earned coins on real-world activities and toys.*

### 3.4. Coach Stats (Parent Console)
* **Description:** A telemetry dashboard for parents to monitor progress.
* **Access:** Must be protected by a PIN code or parental lock.
* **Metrics:** Overall Win Rate (Accuracy), Average Time per task, Total Wins.
* **Battle Log:** A table showing a history of attempts, timestamps, subjects, and outcomes (Win/Loss/Draw).
* **User Story:** *As a parent, I want to see which subjects my child is struggling with and how long they spend on tasks.*

---

## 4. Technical Requirements

### 4.1. Tech Stack
* **Frontend:** React.js (Functional components, Hooks).
* **Styling:** Tailwind CSS (crucial for the complex borders, shadows, and gradients).
* **Icons:** Lucide-React.
* **State Management:** React Context API or Redux (for managing Coins, XP, and unlock states globally).
* **Backend / Database (Required for Production):** Firebase or Supabase.

### 4.2. Responsive Design Constraints
* **Primary Target:** Landscape Tablet (iPad/Android).
* **Secondary Target:** Must degrade gracefully to mobile screens.
* **Touch Optimization:** All buttons must have large hit areas (minimum 44x44px). Active states must be visually pronounced (e.g., `active:translate-y-2`).

---

## 5. Non-Functional Requirements
* **Performance:** Animations (modals, toasts) must be smooth (60fps). Use CSS transitions.
* **Feedback:** Every interaction must have immediate visual feedback.
* **Security:** The "Coach Stats" tab must require a PIN code to prevent the child from altering their own coin balance or faking logs.

---

## 6. Phased Rollout Plan

### Phase 1: MVP (Minimum Viable Product)
* Fully functional frontend UI based on the current mockup.
* Hardcoded task data.
* LocalStorage used to save Coin balance and XP (no cloud backend yet).

### Phase 2: Backend Integration & Parent Controls
* Firebase integration for user authentication (Parent account).
* Cloud database to store real-time coin balance, preventing local tampering.
* Parent Dashboard web-view to add/edit daily tasks and approve Shop purchases.