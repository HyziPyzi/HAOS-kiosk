# HAOS Kiosk Display - Chrome DRM

Eksperymentalny fork [Welizard-bot/HAOS-kiosk](https://github.com/Welizard-bot/HAOS-kiosk), oparty na projekcie Jeffa Kosowsky'ego. Uruchamia Xorg, Openbox i **oficjalny Google Chrome Stable** na fizycznym HDMI komputera z Home Assistant OS. Home Assistant i Supervisor działają dalej w tle.

Obsługiwana jest wyłącznie architektura **amd64/x86_64**. Docelowy sprzęt to **Intel NUC6i3SYK, Core i3-6100U, Intel HD Graphics 520 (Skylake), 8 GB RAM**. Użytkownik potwierdził wyświetlanie HA przez HDMI w wersji 2.0.0. Nowy launcher 2.1.0 wymaga jeszcze testu na fizycznym NUC-u. Testy automatyczne używają wirtualnego X11; nie potwierdzają Bluetooth, HDMI audio ani odtwarzania VOD na tym sprzęcie.

Wersja **2.1.0** dodaje lokalny **TV Launcher**: ciemny interfejs na telewizor 1920×1080, duże kafelki Netflix, Max, Prime Video, YouTube, Home Assistant i WWW. Launcher korzysta z istniejącego serwera HTTP i tego samego profilu Google Chrome.

Debian/glibc i Google Chrome zwiększają szansę zgodności z DRM. Widevine pochodzi wyłącznie z instalacji i mechanizmów Chrome. Repozytorium nie zawiera Chrome, plików `.deb` ani binarnego CDM. Nie publikujemy obrazów kontenerów z Chrome; HAOS buduje obraz lokalnie i pobiera pakiet z podpisanego repozytorium APT Google. Obowiązują warunki korzystania z Google Chrome i usług VOD.

## Instalacja w Home Assistant OS

1. Zrób pełny backup w **Ustawienia → System → Kopie zapasowe** i pobierz go na inny komputer. Sprawdź, czy masz sposób przywrócenia HAOS przez sieć, jeżeli ekran przestanie działać.
2. Zaktualizuj HAOS i Supervisor. Konfigurację sprawdzono ze stabilnym Supervisorem **2026.09.3**; fork używa aktualnego mapowania `app_config`.
3. Podłącz telewizor do HDMI NUC-a, włącz TV i wybierz odpowiednie wejście **przed startem aplikacji**. Podłącz klawiaturę/mysz lub ekran dotykowy USB.
4. Otwórz **Ustawienia → Apps → sklep → ⋮ → Repositories** (w starszym interfejsie: Dodatki → Sklep → Repozytoria).
5. Wklej **https://github.com/HyziPyzi/HAOS-kiosk** i odśwież sklep.
6. Wybierz **HAOS Kiosk Display - Chrome DRM**, wersja **2.2.0**, i zainstaluj. Pierwszy build pobiera pakiety i może potrwać kilka minut. Potrzebny jest dostęp do internetu i wolne miejsce na dysku.
7. Zatrzymaj oryginalny kiosk przed uruchomieniem tego forka. Oba repo mogą być dodane do sklepu, ale dwa Xorg nie mogą jednocześnie sterować tym samym ekranem. Slug `haoskiosk_chrome` i prywatny katalog konfiguracji są oddzielne od oryginału.
8. Zapisz konfigurację poniżej, uruchom aplikację i sprawdź zakładkę **Logi**. Po weryfikacji włącz automatyczny start.

## Konfiguracja

Zmień odpowiednie pola istniejącej konfiguracji; zachowaj pozostałe opcje z formularza:

```yaml
browser_engine: chrome
start_page: launcher
adblock_mode: optimal
ha_url: http://localhost:8123
ha_dashboard: ""
screen_timeout: 0
output_number: 1
audio_sink: auto
keyboard_layout: pl
browser_refresh: 600
rest_ip: 127.0.0.1
rest_port: 8080
rest_bearer_token: ""
command_whitelist: "^$"
vnc_server: ""
debug_mode: false
```

`chromium` jest aliasem uruchamiającym Google Chrome. Luakit i Alpine Chromium nie są instalowane. Domyślnie Chrome otwiera TV Launcher; `start_page: home_assistant` przywraca start na dashboardzie wskazanym przez `ha_url` i `ha_dashboard`. `ha_username` i `ha_password` są opcjonalne: możesz zalogować się ręcznie na ekranie. Jeśli chcesz automatyczne logowanie do HA, wpisz własne dane w konfiguracji aplikacji, najlepiej konto bez praw administratora. Automatyczne logowanie działa wyłącznie dla originu HA; nie wpisuje danych na stronach VOD. Nie umieszczaj haseł w URL.

`output_number` wybiera N-te **podłączone** wyjście zgłoszone przez xrandr. Przy jednym TV użyj `1`. Przy dwóch ekranach sprawdź listę w logach i ewentualnie wybierz `2`. Pozostałe podłączone wyjścia są wyłączane. Wybrany output i pełny wynik xrandr są logowane.

`screen_timeout: 0` wyłącza automatyczne wygaszanie. `browser_refresh` dotyczy tylko stron HA; Netflix, Max, Prime, Spotify i YouTube nie są cyklicznie przeładowywane przez watchdog. `0` całkowicie wyłącza okresowe przeładowanie.

## Blokowanie reklam — uBlock Origin Lite

**Zgodność ustawień:** test z Chrome 155.0.8059.79 i oficjalnym uBOL 2026.1012.1545 wykrył, że poprawnie przekazane polityki nie zawsze stają się efektywnymi ustawieniami uBOL. Dlatego dodatek po starcie sprawdza faktyczny tryb i wyjątki. Gdy potrzeba, ustawia je przez komunikaty używane przez panel ustawień oficjalnego rozszerzenia. Jest to jawne obejście zgodności, zależne od interfejsu uBOL; aktualizacje rozszerzenia mogą wymagać jego dostosowania. Nie zmieniamy kodu ani plików podpisanego rozszerzenia. Nie traktuj samego wpisu w `chrome://policy` jako potwierdzenia efektywnego filtrowania.

Wersja **2.2.0** instaluje darmowe, oficjalne [uBlock Origin Lite (Manifest V3)](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh), ID `ddkjiahejlhfcafbddmgiahcphecmpfh`. Chrome sam pobiera i aktualizuje rozszerzenie z Chrome Web Store. Nie pobieramy CRX skryptem, nie modyfikujemy rozszerzenia i nie dodajemy drugiej przeglądarki.

W konfiguracji dodatku wybierz `adblock_mode`:

| Wartość | Działanie |
| --- | --- |
| `off` | Weryfikator wyłącza całe rozszerzenie przez mechanizm menedżera rozszerzeń Chrome. Instalacja i dane pozostają w profilu. |
| `optimal` | Domyślne Optimal uBOL: filtrowanie sieciowe i kosmetyczne zgodnie z tym trybem. |
| `complete` | Complete uBOL: szersze filtrowanie kosmetyczne; może częściej wymagać wyjątków dla stron. |

We wszystkich trybach używamy `ExtensionSettings → installation_mode: normal_installed`, więc możesz ręcznie wyłączyć rozszerzenie w `chrome://extensions`. Wyłączenie użytkownika pozostaje po restarcie Chrome, także po zmianie konfiguracji na `off` i z powrotem. Aby je ponownie uruchomić, włącz je tam ręcznie. Po zmianie opcji dodatku zapisz konfigurację i **uruchom dodatek ponownie**. Powrót z `off` włącza rozszerzenie automatycznie tylko wtedy, gdy wyłączył je sam dodatek. Nie stosujemy `blocked`, ponieważ Chrome usuwał tak zarządzaną instalację w testach.

`adblock_excluded_domains` to edytowalna lista hostów bez filtrowania, np.:

```yaml
adblock_mode: optimal
adblock_excluded_domains:
  - netflix.com
  - max.com
  - hbomax.com
  - primevideo.com
  - amazon.com
  - amazon.de
  - amazon.co.uk
  - amazon.pl
  - vod.example.org
```

Pierwsze osiem domen to lista domyślna. Wyjątki obejmują również ich subdomeny, np. `play.max.com` i `www.netflix.com`. Wpisuj same domeny ASCII/punycode, bez `https://`, ścieżek, portów, `*.` ani dyrektyw uBOL. Lista zastępuje domyślne wyjątki; `[]` usuwa wyjątki zarządzane przez dodatek. Ręczne wyjątki zapisane w uBOL mogą pozostać. Jeśli używasz Prime Video pod inną domeną regionalną Amazon, dodaj ją. Wyjątek `amazon.com` obejmuje także sklep Amazon. Strony logowania, osadzone odtwarzacze i oddzielne domeny usług mogą wymagać dodatkowych wyjątków. Najpewniejsza diagnostyka problemu VOD to chwilowe `off`.

Polityka jest generowana przy każdym starcie **przed Chrome**, atomowo do `/etc/opt/chrome/policies/managed/haoskiosk-ublock-origin-lite.json` (root, tryb 0644). Zawiera tylko ustawienia tego rozszerzenia: `ExtensionSettings` z oficjalnym HTTPS update URL Google oraz `3rdparty.extensions.<ID>` z `defaultFiltering`, `noFiltering` i `disableFirstRunPage`. Nie blokujemy panelu ustawień uBOL. Pozostałe pliki polityk są zachowane; konfliktujące zasady administratora trzeba sprawdzić w `chrome://policy`. Opcje zapisuje Supervisor, a plik polityki jest odtwarzany także po aktualizacji kontenera. Profil `/config/chromium-profile`, logowania, Widevine, launcher, HDMI, GPU i pilot korzystają z dotychczasowych mechanizmów.

Dodatkowo `ExtensionSettings.runtime_blocked_hosts` ogranicza uprawnienia rozszerzenia do modyfikowania wskazanych hostów bezpośrednio w Chrome. Lista może zawierać maksymalnie 100 unikalnych domen. Jest to dodatkowa ochrona; skuteczność pełnego wyjątku uBOL nadal sprawdzaj w jego panelu i odtwarzaczu.

### Sprawdzenie instalacji i restartu

Weryfikator używa istniejącego DevTools wyłącznie na loopback. Otwiera tymczasową kartę ustawień w tle i zamyka ją po sprawdzeniu; polecenia kiosku pomijają tę kartę. Nie zmienia aktywnej strony ani flag DRM/GPU. Czeka maksymalnie 180 sekund na instalację/konfigurację, a przy błędzie zapisuje ostrzeżenie i pozwala działać kioskowi. Ręcznie wyłączonego rozszerzenia nie włącza. Plik `/config/ubol-managed-state.json` przechowuje wyłącznie listę wyjątków dodanych przez obejście: pozwala je później usunąć z konfiguracji, zachowując wcześniejsze ręczne wyjątki użytkownika. Oczekiwany komunikat sukcesu to `uBOL ... verified ...` z metodą konfiguracji.

1. Uruchom dodatek z dostępem do internetu. W logach sprawdź komunikat `Chrome uBlock Origin Lite policy`, tryb i liczbę wyjątków. To potwierdza zapis konfiguracji, **nie instalację rozszerzenia**.
2. Otwórz `chrome://policy` przez opisane niżej `/launch_url`. Wybierz przeładowanie zasad; sprawdź `ExtensionSettings` i zasady uBlock Origin Lite bez błędów. Instalacja z Web Store i odczyt `storage.managed` są asynchroniczne — mogą potrwać.
3. Otwórz `chrome://extensions`: sprawdź ID, wersję i włączony przełącznik. W „Opcjach rozszerzenia” sprawdź Optimal/Complete i wyjątki. Jeśli instalacji brakuje, sprawdź dostęp DNS/HTTPS do usług Google/Web Store, logi Chrome i konflikty polityk; nie kasuj profilu.
4. Sprawdź zwykłą stronę i wybrany VOD, następnie wykonaj normalny restart dodatku. Potwierdź zachowane logowania, rozszerzenie, tryb i wyjątki. Ręcznie wyłącz rozszerzenie, ponów restart i sprawdź, że pozostaje wyłączone.
5. Sprawdź `off`, potem powrót do Optimal/Complete, rzeczywiste odtwarzanie chronionego filmu i HDMI audio. Przy błędzie VOD dodaj domenę lub ustaw `off`, uruchom dodatek ponownie i porównaj wynik.

**Nie gwarantujemy usunięcia reklam z YouTube ani zgodności filtrowania ze wszystkimi serwisami DRM.** Blokowanie nie zastępuje subskrypcji i nie zmienia uprawnień do treści. Automatyczny test sprawdza instalację oficjalnego MV3, rzeczywisty odczyt polityk przez rozszerzenie, efektywne tryby/wyjątki oraz restart w wirtualnym X11; fizyczny NUC i licencje VOD wymagają osobnego sprawdzenia.

Źródła konfiguracji: [oficjalne managed settings uBOL](https://github.com/uBlockOrigin/uBOL-home/wiki/Managed-settings), [polityki rozszerzeń na Linuksie](https://www.chromium.org/administrators/configuring-policy-for-extensions/), [ExtensionSettings i normal_installed](https://www.chromium.org/administrators/policy-list-3/extension-settings-full/).

## TV Launcher i pilot HID

Na fizycznym ekranie Chrome otwiera `http://127.0.0.1:<rest_port>/launcher`. Nie otwieraj tego adresu na swoim laptopie: localhost odnosi się do urządzenia, na którym działa przeglądarka. Launcher nie wymaga tokenu REST, ponieważ jego strona, zasoby i konfiguracja są dostępne wyłącznie przez loopback. Polecenia API nadal zachowują istniejącą autoryzację. Przy konfiguracji `rest_ip` na adres LAN serwer dodatkowo nasłuchuje na loopback na tym samym porcie; launcher jest blokowany dla klientów sieciowych również z tokenem. Nie jest dodawany nowy publiczny port.

- **Strzałki**: wybierają kafelek w siatce; jasna ramka pokazuje wybór. **Enter / OK**: otwiera stronę w bieżącym oknie, z zachowaniem profilu i logowań.
- **Wstecz** (`Escape`, HID `BrowserBack` / `GoBack`, `Alt+Left`, albo Backspace poza polem tekstowym): zamyka formularz WWW; na głównym ekranie wybiera pierwszy kafelek. Na stronie VOD działanie Wstecz zależy od strony i Chrome.
- **Ctrl+Alt+H**: globalny powrót do launchera przez Openbox i lokalne CDP, także gdy strona przechwytuje klawisze. Nie zamyka Chrome ani nie usuwa danych. Launcher zapamiętuje ostatni wybrany kafelek na czas sesji. Skrót jest dostępny również z `start_page: home_assistant`.
- **Home Assistant**: otwiera dotychczasowy `ha_url` / `ha_dashboard`. API `/launch_url` bez adresu nadal otwiera dashboard HA; jego znaczenie nie zmieniło się.
- **WWW**: otwiera formularz adresu. Wpisz `youtube.com`, pełny adres HTTPS lub adres lokalny z `http://`. Bez schematu wybierane jest HTTPS. Dozwolone są tylko HTTP/HTTPS, bez loginu/hasła w URL. Strzałki góra/dół przechodzą między polem i przyciskami; lewo/prawo w polu edytują tekst. Enter otwiera adres, Wstecz anuluje. Backspace w polu usuwa znak.
- Do wpisywania adresów użyj klawiatury USB, pilota z klawiaturą lub istniejącego Onboard (`onscreen_keyboard: true`, pokazanie przez **Ctrl+Alt+O**). Pełnego wpisywania tekstu samymi strzałkami nie dodano.

Pilot musi być widoczny dla HAOS/Xorg jako urządzenie HID klawiatury/myszy i wysyłać odpowiednie klawisze. Nie każdy pilot wysyła Enter lub BrowserBack. Nie dodano parowania Bluetooth, obsługi HDMI-CEC ani mapowania przycisków producentów. **Fizyczny pilot USB/Bluetooth i obsługa serwisów Netflix/Max/Prime przez pilot nie są jeszcze potwierdzone.** Nawigacja wewnątrz stron VOD może wymagać myszy/air mouse; launcher nie zmienia ich interfejsu.

Jeśli launcher nie odpowiada przy starcie, dodatek loguje ostrzeżenie i uruchamia dotychczasowy dashboard HA. Sprawdź konflikt portu `rest_port` i logi serwera. Strona nie pobiera zewnętrznych skryptów, fontów ani grafik i nie zapisuje tokenu REST w przeglądarce.

## Aktualizacja 2.0.0 → 2.1.0 i powrót

1. Przed aktualizacją zrób backup dodatku **w wersji 2.0.0**, zawierający jego dane i opcje; pobierz backup poza NUC. Kopia `cold` zatrzymuje Chrome na czas zapisu. Zachowaj również pełny backup HA i klucz potrzebny do jego odtworzenia.
2. Odśwież sklep/repozytoria w HA i wybierz aktualizację istniejącego **HAOS Kiosk Display - Chrome DRM**. Nie odinstalowuj działającego dodatku. Slug, profil, GPU, audio i dotychczasowe opcje pozostają te same.
3. Ustaw `start_page: launcher` i uruchom dodatek. Sprawdź obraz, audio, sześć kafelków i skrót `Ctrl+Alt+H`. Dla powrotu do dotychczasowej strony ustaw `start_page: home_assistant` i zrestartuj dodatek.
4. Dla pełnego cofnięcia wersji użyj **przywrócenia dodatku i jego danych z backupu 2.0.0**. Cofnięcie przywróci również stan profilu z daty kopii. To lepsze rozwiązanie niż wymiana binarki pod nowszym profilem Chrome.

Kod 2.0.0 jest zachowany jako tag [`v2.0.0`](https://github.com/HyziPyzi/HAOS-kiosk/tree/v2.0.0). Tag służy odtworzeniu źródeł; sklep HA instaluje wersję z domyślnej gałęzi i nie oferuje automatycznego wyboru tagów. Build dowolnej wersji pobiera aktualny Google Chrome, więc sam tag nie przypina starej wersji przeglądarki.

## Trwały profil i backup

Chrome zapisuje profil w **`/config/chromium-profile`** wewnątrz aplikacji. Nazwa została zachowana dla kompatybilności. Jest to własny katalog konfiguracji aplikacji (`/app_configs/<identyfikator_repo>_haoskiosk_chrome` na aktualnym HAOS), a nie katalog konfiguracji Core. Aktualizacje i restarty zachowują cookies, local storage, preferencje i komponenty przeglądarki. Nie nadpisujemy Preferences istniejącego profilu ani nie usuwamy Service Worker.

Przy zatrzymaniu aplikacja prosi Chrome przez lokalny CDP o normalne zamknięcie i zapis profilu. Twarde odcięcie zasilania nadal może utracić ostatnie zapisy. Backup aplikacji jest typu `cold`, aby zatrzymać przeglądarkę na czas kopii. Backup zawiera poufne dane profilu i ewentualne hasła z opcji: przechowuj go bezpiecznie. Odinstalowanie aplikacji z usunięciem danych usuwa profil.

Profil oryginalnego dodatku nie jest automatycznie importowany. Do ewentualnej ręcznej migracji kopiuj cały profil przy **obu aplikacjach zatrzymanych**, po wykonaniu backupu. Chrome może zaktualizować format profilu; nie zakładaj, że cofnięcie do starego Chromium będzie bezpieczne.

## HDMI audio

Aplikacja korzysta z usługi audio Supervisora przez PulseAudio (`audio: true`), Debianowego `pactl` i `libasound2-plugins`. Nie uruchamia osobnego serwera PulseAudio.

- `auto`: preferuje istniejący sink HDMI, potem domyślny sink HA, potem pierwszy dostępny.
- `hdmi`: wybiera pierwszy dostępny sink zawierający `hdmi`.
- `usb`: wybiera pierwszy sink USB.
- `none`: tworzy/wybiera null sink, czyli wyciszony output.

Jeśli HA nie udostępnia sinka HDMI, wybierz wyjście HDMI w ustawieniach audio aplikacji / urządzenia HAOS. Dostępne karty, profile i wyjścia można sprawdzić poleceniami HA CLI `ha audio info` oraz `pactl list short sinks` wewnątrz kontenera. Zmiany profilu karty konfiguruj w usłudze audio HAOS. Fork nie przełącza automatycznie profili innych aplikacji.

Najpierw sprawdź zwykły film YouTube i głośność TV. W logach powinien pojawić się sink `...hdmi...` oznaczony `*`. Polecenia diagnostyczne w powłoce **kontenera kiosku**:

```sh
pactl list short sinks
pactl info
pactl get-sink-mute @DEFAULT_SINK@
pactl get-sink-volume @DEFAULT_SINK@
```

## Otwieranie stron i diagnostyka Chrome

Istniejący endpoint **POST `/launch_url`** obsługuje dowolne prawidłowe URL HTTP/HTTPS, a także wybrane strony diagnostyczne Chrome. Żądanie bez `url` wraca do dashboardu HA. Przykład z powłoki hosta lub kontenera mającego dostęp do localhost HAOS:

```sh
curl -fsS -X POST http://127.0.0.1:8080/launch_url \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.netflix.com/"}'
```

Analogicznie otworzysz `https://play.max.com/`, `https://www.primevideo.com/`, `https://open.spotify.com/` lub `https://www.youtube.com/`. Inne endpointy zachowane z upstream: `/refresh_browser`, `/display_on`, `/display_off`, `/is_display_on`, `/mute_audio`, `/unmute_audio`, `/toggle_audio`, `/screenshot`, `/enable_inputs`, `/disable_inputs`. Gesty korzystają z tego samego klienta sterowania Chrome.

Dla automatyzacji HA najwygodniej ustawić `rest_ip` na **adres LAN NUC-a** i własny mocny `rest_bearer_token`. Żądania HA Core pochodzą z osobnego kontenera; `127.0.0.1` Core nie musi wskazywać hosta HAOS. Nie używaj pustego tokenu przy wystawieniu API do LAN. Fork odmawia uruchomienia REST na nielokalnym adresie bez tokenu. Przykład do własnego `configuration.yaml` HA (zastąp adres):

```yaml
rest_command:
  kiosk_netflix:
    url: "http://192.168.1.50:8080/launch_url"
    method: POST
    headers:
      authorization: !secret kiosk_rest_authorization
    content_type: "application/json"
    payload: '{"url":"https://www.netflix.com/"}'
```

W swoim `secrets.yaml` dodaj `kiosk_rest_authorization` z wartością `Bearer ` i ustawionym przez siebie tokenem. API działa przez HTTP: używaj wyłącznie zaufanej sieci LAN/VPN, nie przekierowuj go do internetu. Nie wklejaj prawdziwego tokenu w publiczne logi ani repo. Interfejs edytora jest dostępny pod `/` na porcie REST; zapis wymaga tokenu, jeśli został ustawiony. Ingress nie jest używany. Żądania z nagłówkiem Origin są blokowane, więc sterowanie powinno odbywać się przez `rest_command` HA lub curl, a nie fetch z obcej strony internetowej.

W trybie kiosk najłatwiej otworzyć strony wewnętrzne przez API:

```sh
curl -fsS -X POST http://127.0.0.1:8080/launch_url \
  -H 'Content-Type: application/json' -d '{"url":"chrome://components"}'
```

Jeśli włączyłeś token, dodaj nagłówek Authorization z własną wartością. Zmieniaj `url` na:

- **`chrome://version`**: wersja, binarka i lokalna ścieżka profilu. Wersja jest również w logach startowych (`google-chrome-stable --version`).
- **`chrome://gpu`**: Graphics Feature Status, GL renderer, Problems Detected. Szukaj Intel/Mesa i przyspieszanych funkcji; `llvmpipe` oznacza rendering programowy. Przyspieszenie renderowania i dekodowania wideo to oddzielne funkcje.
- **`chrome://components`**: Widevine Content Decryption Module i jego wersja, jeśli komponent jest widoczny w tej wersji Chrome. Jeśli jest przycisk aktualizacji, użyj go przy dostępie do internetu. Nie każda wersja Chrome pokazuje komponent dostarczony w pakiecie w identyczny sposób.
- **`chrome://settings/content/protectedContent`**: zezwolenie na odtwarzanie treści chronionych.
- **`chrome://media-internals`**: diagnoza odtwarzania, dekodera i błędów CDM. Te ekrany mogą zawierać szczegóły oglądanej sesji; nie publikuj ich bez sprawdzenia.

## Test Netflix / Max / Prime / Spotify

1. Sprawdź wersję Chrome, `chrome://gpu`, Widevine i YouTube z dźwiękiem.
2. Otwórz Netflix przez `/launch_url`, zaloguj się bezpośrednio na ekranie, uruchom rzeczywisty chroniony film i sprawdź obraz oraz dźwięk. Samo wyświetlenie strony nie testuje DRM.
3. Odtwarzaj przez kilkanaście minut i sprawdź przewijanie / fullscreen. Następnie zatrzymaj aplikację normalnie, uruchom ponownie, wróć do Netflix i sprawdź zachowane logowanie.
4. Powtórz z Max, Prime Video i Spotify Web. Zapisz komunikat/kod błędu serwisu, wersję Chrome i stan GPU, jeśli odtwarzanie się nie uda.

Obecność `libwidevinecdm.so` i pozytywne EME `com.widevine.alpha` potwierdzają wykrycie mechanizmu DRM; **nie potwierdzają otrzymania licencji ani zgodności konkretnego serwisu**. W testach lokalnych negocjacja EME z oficjalnym Chrome przeszła.

## Logi i problemy

Logi: **Apps → HAOS Kiosk Display - Chrome DRM → Logi**. Start raportuje wersję/ścieżkę Chrome, architekturę, widoczne `card*`/`renderD*`, sterownik GPU ze sysfs, podłączone złącza, wybrany output, wynik xrandr, audio sinks i ścieżkę biblioteki Widevine, jeśli ją znajdzie. Nie odczytuje cookies, tokenów ani plików sesji. Nie włączaj `set -x` przy diagnozie z prawdziwymi danymi logowania.

### Czarny ekran

- Włącz TV i wybierz HDMI przed startem. Sprawdź kabel, inne wejście TV i ewentualnie inny ekran.
- Zatrzymaj oryginalny kiosk lub inne Xorg. Sprawdź w logach `connected`, `Selected physical output` oraz powodzenie startu X.
- Przy dwóch podłączonych ekranach zmień `output_number`. Przy problemach z EDID spróbuj 1920×1080/60 Hz zamiast 4K.
- Użyj `debug_mode: true`, żeby uruchomić X/Openbox bez Chrome i rozdzielić problem Xorg od przeglądarki. Sprawdź `/var/log/Xorg.0.log` wewnątrz kontenera; nie usuwaj profilu Chrome.
- Dla GPU sprawdź `chrome://gpu`; fork nie wymusza software renderingu ani ignorowania blokady sterowników Chrome. Rendering programowy w wirtualnym Dockerze na PC nie dowodzi awarii i915 na NUC-u.

### Brak dźwięku

- Sprawdź głośność/mute w TV, odtwarzaczu i PulseAudio. Włącz TV przed startem i ustaw `audio_sink: hdmi`.
- Sprawdź `ha audio info`, listę sinków i profil HDMI w ustawieniach audio HAOS. Brak sinka HDMI nie jest naprawiany instalowaniem drugiego PulseAudio w aplikacji.
- Jeśli nie ma żadnych sinków, sprawdź usługę audio Supervisora i ustawienia wyjścia aplikacji. Jeśli zwykły YouTube ma dźwięk, a VOD nie, diagnozuj również odtwarzacz/DRM serwisu.

### Brak `/dev/dri` lub input

- `video: true` daje dostęp do istniejących urządzeń wideo przez Supervisor; fork nie wymaga istnienia `card1`. Typowy Intel to `card0` i `renderD128`, lecz wybór karty opiera się na podłączonym złączu, nie na sztywnej numeracji.
- W powłoce kontenera sprawdź `ls -l /dev/dri`, a na hoście `ls -l /sys/class/drm` i czy kernel HAOS załadował i915. Sterownik jądra pochodzi z HAOS; nie instalujemy go w kontenerze.
- Jeśli urządzenia nie istnieją na hoście, sprawdź BIOS / aktywną grafikę zintegrowaną, aktualizacje HAOS i restart z podłączonym TV.
- Zachowano listę `/dev/input/event0`–`event25` upstream. Supervisor ignoruje nieistniejące urządzenia; przy nietypowej numeracji ponad 25 potrzebna jest zmiana listy w forku. Udev w kontenerze i libinput obsługują myszy, klawiatury i touch. Aktualny HAOS mapuje `/dev`; dostęp regulują reguły urządzeń.

### Widevine / VOD

- Sprawdź `chrome://version`, komponenty, uprawnienia protected content, czas systemu, internet, DNS i dostęp do serwerów usług/Google. Daj Chrome czas na aktualizację komponentu i uruchom ponownie.
- Sprawdź bibliotekę w logach i rzeczywisty chroniony film. Jeśli serwis zgłasza nieobsługiwaną przeglądarkę, zanotuj wersję Chrome i kod błędu.
- Odbuduj/zaktualizuj aplikację, aby zainstalować nowszy Chrome. Nie pobieraj CDM z przypadkowych stron i nie kopiuj binariów Widevine do repo.
- Nie resetuj całego profilu jako pierwszego kroku; stracisz logowania. Przed resetem wykonaj backup przy zatrzymanej aplikacji.

## Uprawnienia i ograniczenia

Chrome działa jako root w kontenerze z **`--no-sandbox`**, ponieważ jego standardowy sandbox odmawia startu jako root. Zachowano model upstream dla dostępu Xorg/GPU/input. Fork potrzebuje `SYS_ADMIN` do mechanizmu tty/remount Xorg i `MKNOD` do przywracania tty; AppArmor jest wyłączony, ponieważ standardowy profil blokuje mount. Nie jest to izolacja odpowiednia dla nieufnych stron. Uprawnienia służą fizycznemu ekranowi; Home Assistant nie jest uruchamiany w kontenerze Chrome.

DevTools słucha **wyłącznie `127.0.0.1:9222`** i nie jest publikowany w LAN. Xorg ma `-nolisten tcp`. REST domyślnie słucha localhost:8080; inne bindy wymagają tokenu dla wszystkich poleceń. Dowolne komendy użytkownika są domyślnie wyłączone (`command_whitelist: "^$"`); wbudowane działania kiosku działają dalej. Opcjonalny VNC jest wyłączony; po ustawieniu hasła słucha wyłącznie localhost:5900 i wymaga tunelu SSH. `vnc_server: "-"` jest odrzucane. Nie uruchamiaj drugiego forka z tymi samymi portami.

`--password-store=basic` pozwala na trwały profil bez osobnego systemowego keyringu; zabezpiecz dostęp do danych aplikacji i backupów. Nie udostępniaj profilu przez serwer WWW.

Netflix, Max i Prime mogą ograniczać jakość według OS, przeglądarki, poziomu DRM, HDCP, planu, regionu i własnych polityk. **Nie gwarantujemy odtwarzania w każdej usłudze ani 4K/HDR.** Intel HD 520 ma ograniczenia dekodowania nowszych kodeków; działający GPU nie oznacza sprzętowego dekodowania każdego filmu. Obciążenie Chrome konkuruje z HA o CPU/RAM. Możliwe są zerwania odtwarzania po zmianach usług, Chrome, HAOS lub komponentów DRM.

## Build i weryfikacja dla autorów

Baza: oficjalny HA `base-debian:trixie`, przypięty digest manifestu w Dockerfile. amd64 jest sprawdzane również przez `dpkg --print-architecture`. `BUILD_FROM` ma jawny domyślny obraz; można go nadpisać świadomie. `build.yaml` nie jest wymagany ani używany przez obecny Supervisor. S6, bashio i TempIO pochodzą z bazy HA.

```sh
docker build --platform linux/amd64 --build-arg BUILD_ARCH=amd64 -t haoskiosk-chrome:test haoskiosk
docker build -f tests/Dockerfile -t haoskiosk-chrome:checks .
docker run --rm -v "$PWD:/src:ro" haoskiosk-chrome:checks
docker run --rm --entrypoint hadolint -v "$PWD:/src:ro" hadolint/hadolint:latest-alpine --ignore DL3008 /src/haoskiosk/Dockerfile
```

Testy obejmują YAML/JSON, składnię Python/JavaScript, shellcheck, dostępność programów, rzeczywisty Chrome w Xvfb z flagami produkcyjnymi, CDP, zachowanie cookies/local storage po normalnym restarcie, negocjację EME Widevine, nasłuch DevTools tylko loopback, autoryzację REST i ograniczenie URL/originu. Testy launchera sprawdzają geometrię 1920×1080, strzałki/Enter/Wstecz, formularz WWW, adresy kafelków, nawigację do lokalnych stron testowych, prawdziwy skrót Openbox z innej strony i zachowanie `/launch_url`. CI zapisuje zrzut launchera jako osobny artefakt. Nie zastępują testów HDMI, i915, audio HAOS, fizycznego pilota na NUC-u ani licencji serwisów. Nie publikuj wynikowego obrazu zawierającego Chrome.

Aktualne źródła sprawdzone 2026-09-30: [HA Apps configuration](https://developers.home-assistant.io/docs/apps/configuration/), [migracja buildera do BuildKit](https://developers.home-assistant.io/blog/2026/04/02/builder-migration/), [oficjalne obrazy HA Debian](https://github.com/home-assistant/docker-base), [konfiguracja urządzeń Supervisora](https://github.com/home-assistant/supervisor/blob/main/supervisor/docker/app.py), [klucze podpisujące Google](https://www.google.com/linuxrepositories/).

Podziękowania: Jeff Kosowsky oraz autorzy Welizard-bot/HAOS-kiosk. Kod forka zachowuje licencję upstream; licencja projektu nie obejmuje własnościowych binariów Chrome/Widevine.
