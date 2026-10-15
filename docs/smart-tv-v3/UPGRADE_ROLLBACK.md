# Aktualizacja, konfiguracja HA i powrót do 2.2.0

Nie wdrażamy automatycznie na NUC. Zatwierdzenie PR nie jest zgodą na wdrożenie.
Zachowujemy slug `haoskiosk_chrome`, dane i oficjalny profil Chrome.

## Przed aktualizacją

1. W Home Assistant utwórz pełną kopię zapasową obejmującą ten dodatek i pobierz ją
   na zaufany komputer. Sprawdź hasło szyfrowania, obecność dodatku i możliwość odczytu
   metadanych backupu. Zapisz wersję 2.2.0, tag/commit i obecne opcje.
2. Zatrzymaj TYLKO dodatek kiosk, aby Chrome zapisał profil. HAOS i HA pozostają włączone.
   Wykonaj dodatkowy backup dodatku po zatrzymaniu. Zachowaj cały katalog danych/profilu
   Chrome, nie tylko cookies. Nie otwieraj tej samej kopii równocześnie w dwóch Chrome.
3. Wersja 3.0 nie migruje katalogu profilu Chrome i nie zmienia DRM/adblock, jednak
   pakiet Chrome Stable może być nowszy przy budowie. Powrót do starszego Chrome
   powinien używać profilu z backupu wykonanego przed aktualizacją.

## Aktualizacja

Po zatwierdzeniu wydania przez właściciela odśwież repozytorium dodatków w HA,
wybierz istniejący dodatek, wykonaj aktualizację i uruchom go. Nie odinstalowuj ani
nie zmieniaj slug; nie reinstaluj HAOS. Wydanie z PR można przetestować jako lokalny
build tego samego dodatku według standardowej procedury HA, po osobnym zatwierdzeniu
i z backupem. Nie kieruj produkcyjnego HAOS na niesprawdzonego brancha.

Wersja 3.0 zachowuje start_page, ustawienia audio/GPU, adblock i wyjątki VOD, token
legacy REST i trwały profil. Nowe dane są w `/config/smart-tv/state.sqlite3`; HTTPS
jest domyślnie wyłączony. Najpierw potwierdź launcher, Ctrl+Alt+H, audio i działanie HA.
Następnie skonfiguruj [HTTPS i parowanie](HTTPS.md).

## Panasonic i inteligentny dom

Dodatek korzysta z istniejącej integracji Panasonic Viera przez HA Core API.
Nie wpisuj tokenu HA w pilocie. Supervisor dostarcza go do procesu serwera, a opcja
`homeassistant_api: true` daje dostęp do Core API. Nie zwiększamy uprawnień Linux.

Na TV, w ustawieniach Home Assistant wybierz:

- właściwą encję `media_player` Panasonic;
- źródło HDMI wyłącznie jeśli integracja podaje je w source_list i obsługuje wybór;
  w przeciwnym razie pozostaw źródło puste — NUC jest już jedynym źródłem HDMI;
- wybrane światła, przełączniki, sceny/skrypty i sensory temperatury/wilgotności;
- encję weather; baza pokazuje warunki/temperaturę bez prognozy;
- opcjonalną scenę, lampy, jasność, aplikację i głośność Wieczoru filmowego.

Konfiguracja sceny/lamp musi wskazywać encje wybrane do sterowania. Uruchomienie
sceny/skryptu wykonuje jej własne działania HA — sprawdź jej zawartość przed wyborem.
Nie hardcodujemy nazw pomieszczeń ani urządzeń. Nie obiecujemy HDMI ani regulacji
głośności, jeśli flagi funkcji encji ich nie udostępniają.

Polecenia polskie działają przez lokalny parser tekstu. W iPhone użyj dyktowania
systemowej klawiatury w polu polecenia (jego dostępność offline zależy od iOS/języka).
Opcjonalny fallback Assist włącz na TV dopiero po skonfigurowaniu lokalnego agenta
rozmowy w HA i encji wystawionych temu agentowi. Uprawnienia Assist wynikają z jego
konfiguracji HA i mogą być szersze od kafelków pilota. Nie dodajemy ciężkiego STT do NUC.
Wariant bazowy zgłasza `audio_stt:false`; nie obsługuje przesyłania nagrania mikrofonu.

## Kontrola na NUC

Sprawdź kolejno: HA nadal dostępny; launcher 1080p, safe_area i USB HID; profil i cookies
po restarcie; uBOL tryby/wyjątki; Intel GPU i HDMI audio; Netflix/Max/Prime prawdziwy
film, jakość i DRM; TV on/off oraz timeout, opcjonalne HDMI; pilot Safari/PWA, touchpad
z widocznym kursorem; reconnect, revocation, profile; lokalny HTTPS bez ostrzeżeń;
CPU/RAM podczas odtwarzania i pracy HA. Nie traktuj obecności Widevine jako playback pass.

## Rollback

Zatrzymaj tylko dodatek. Przywróć wcześniejszy backup tego dodatku wraz z obrazem,
opcjami i profilem Chrome; w UI HA wybierz przywracanie częściowe wyłącznie dodatku,
jeśli nie chcesz odtwarzać stanu całego HA. Alternatywnie odbuduj znany commit/tag 2.2.0
w lokalnej konfiguracji dodatku i przywróć przedaktualizacyjny profil i opcje z backupu.
Nie uruchamiaj starego Chrome z profilem zmienionym przez nowszą wersję.

Nowy katalog smart-tv można zachować offline do ponownego testu v3. Nie usuwaj backupu,
wersji ani tagów. Uruchom dodatek 2.2.0 i sprawdź ekran HA/launcher, dźwięk, adblock i
VOD. Wyłącz nowy port HTTPS i usuń zaufanie CA z telefonu, jeśli rezygnujesz z pilota.
