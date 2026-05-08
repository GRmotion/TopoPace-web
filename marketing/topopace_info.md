# TopoPace — Race Planner

---

## Krótki opis

TopoPace to bezpłatna aplikacja webowa do planowania startu w biegach górskich i ultramaratonach. Wgraj trasę GPX, ustaw cel czasowy i otrzymaj gotowy harmonogram z przewidywanymi godzinami dotarcia do każdego punktu kontrolnego — obliczony na podstawie profilu wysokości i Twoich indywidualnych współczynników.

---

## Długi opis

### Czym jest TopoPace?

TopoPace to narzędzie dla biegaczy górskich, którzy chcą pojawić się na linii startu z konkretnym planem — nie przybliżonym, ale obliczonym na podstawie rzeczywistego profilu trasy, własnego tempa i specyfiki terenu. Działa w całości w przeglądarce, nie wymaga instalacji ani rejestracji, a dane nigdy nie opuszczają Twojego urządzenia.

### Główne funkcje

**Wczytywanie trasy GPX**
Aplikacja importuje pliki GPX z dowolnego urządzenia lub platformy (Garmin, Suunto, Coros, Strava, Komoot). Na podstawie współrzędnych GPS oblicza skumulowany dystans i automatycznie wygładza profil wysokości, eliminując szum z danych barometrycznych.

**Interaktywna mapa i profil wysokości**
Trasa wyświetla się jednocześnie na mapie (OpenStreetMap) i na wykresie elewacji. Kursor synchronizuje oba widoki — najechanie na profil podświetla odpowiedni punkt na mapie. Wykres można dowolnie skalować w pionie, przeciągając uchwyt między mapą a profilem.

**Punkty kontrolne**
Checkpointy dodasz klikając w dowolnym miejscu na profilu wysokości lub na mapie, albo wpisując kilometraż ręcznie. Każdy punkt ma typ (stacja żywnościowa lub waypoint), nazwę, planowany czas postoju oraz opcjonalne okno czasowe (cutoff). Notatki do checkpointów — np. "dostęp dla crew", "drop bag" — trafiają do wydrukowanego harmonogramu.

**Model tempa oparty na fizjologii**
Obliczenia bazują na modelu Minettiego — najdokładniejszym matematycznym opisie kosztu energetycznego biegu po nachyleniu. Każdy 50-metrowy segment trasy otrzymuje własne tempo uwzględniające aktualny gradient i postępujące zmęczenie. Całkowity czas biegu jest skalowany tak, by suma zawsze równała się Twojemu celowi.

**Trudność terenu**
Zaznacz na profilu odcinki o szczególnym podłożu i przypisz im wartość procentową: dodatnia spowalnia (kamienie, błoto, piargi), ujemna przyspiesza (asfalt, ubita ścieżka). Reszta trasy automatycznie kompensuje zmianę, zachowując docelowy czas mety.

**Kalibracja z aktywności**
Wgraj plik .GPX lub .FIT z zarejestrowanej aktywności, a TopoPace wyliczy Twój osobisty profil: współczynnik podejść, współczynnik zejść i tempo narastania zmęczenia. Im więcej aktywności, tym dokładniejsza kalibracja. Profil jest zapisywany lokalnie i dostępny przy kolejnych wizytach.

**Harmonogram startu**
Wynikowa tabela pokazuje dla każdego punktu kontrolnego: przewidywane ETA, godzinę wyjścia po postoju, okno czasowe i bufor do cutoffa (zielony / żółty / czerwony). Zmiana czasu postoju na dowolnej stacji natychmiast przelicza wszystkie kolejne ETA.

**Wydruk**
Jeden przycisk generuje czysty, jednostronicowy harmonogram gotowy do druku lub zapisu jako PDF — bez elementów interfejsu, w czytelnej typografii, przeznaczony do wycięcia i zabrania na bieg.

### Dla kogo?

- Biegacze startujący w ultramaratonach i biegach górskich z punktami kontrolnymi i cutoffami
- Zawodnicy chcący skalibrować plan na podstawie własnej historii treningowej
- Pacerzy i crew planujący punkty wsparcia na trasie

### Technologia

Aplikacja działa w całości po stronie klienta (React + TypeScript). Żadne dane — trasa, aktywności, profil osobisty — nie są wysyłane na serwer. Kalibracja zapisywana jest lokalnie w przeglądarce (localStorage).

---
---

# TopoPace — Race Planner (English)

---

## Short description

TopoPace is a free web app for planning mountain and ultra race days. Upload a GPX route, set your goal time, and get a ready-made schedule with predicted arrival times at every checkpoint — calculated from the elevation profile and your personal pace factors.

---

## Long description

### What is TopoPace?

TopoPace is a tool for mountain runners who want to show up at the start line with a real plan — not an approximation, but one calculated from the actual route profile, their own pace, and the specific characteristics of the terrain. It runs entirely in the browser, requires no installation or account, and your data never leaves your device.

### Key features

**GPX route import**
The app imports GPX files from any device or platform (Garmin, Suunto, Coros, Strava, Komoot). It calculates cumulative distance from GPS coordinates and automatically smooths the elevation profile, removing noise from barometric data.

**Interactive map and elevation profile**
The route is displayed simultaneously on a map (OpenStreetMap) and on an elevation chart. The cursor synchronises both views — hovering over the profile highlights the corresponding point on the map. The chart height can be freely adjusted by dragging the divider between the map and profile.

**Checkpoints**
Add checkpoints by clicking anywhere on the elevation profile or map, or by typing a distance manually. Each checkpoint has a type (aid station or waypoint), a name, a planned stop duration, and an optional cutoff time. Notes — e.g. "crew access", "drop bag" — are included in the printed schedule.

**Physiology-based pace model**
Calculations are based on the Minetti model — the most accurate mathematical description of the energy cost of running on a slope. Every 50-metre segment of the route gets its own pace accounting for the current gradient and progressive fatigue. The total running time is scaled so the sum always matches your goal.

**Terrain difficulty**
Select sections of the profile with specific surface conditions and assign them a percentage adjustment: positive slows you down (rocks, mud, scree), negative speeds you up (asphalt, packed trail). The rest of the route automatically compensates, preserving your target finish time.

**Activity calibration**
Upload a .GPX or .FIT file from a recorded activity and TopoPace will calculate your personal profile: uphill factor, downhill factor, and fatigue rate. More activities mean more accurate calibration. The profile is saved locally and available on your next visit.

**Race schedule**
The results table shows for each checkpoint: predicted ETA, departure time after the stop, cutoff time, and buffer to cutoff (green / yellow / red). Changing the stop time at any aid station instantly recalculates all subsequent ETAs.

**Print**
One button generates a clean, single-page schedule ready to print or save as PDF — no UI elements, readable typography, designed to be cut out and taken on the race.

### Who is it for?

- Runners competing in ultramarathons and mountain races with checkpoints and cutoff times
- Athletes who want to calibrate their plan based on their own training history
- Pacers and crew planning support points along the course

### Technology

The app runs entirely client-side (React + TypeScript). No data — route, activities, personal profile — is sent to a server. Calibration is stored locally in the browser (localStorage).
