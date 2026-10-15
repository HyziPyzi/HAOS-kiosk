# Bezpłatne HTTPS w sieci domowej i parowanie iPhone'a

Pilot wymaga poprawnie zaufanego HTTPS. Nie akceptuj ostrzeżeń certyfikatu, nie
wyłączaj weryfikacji Safari i nie wystawiaj portu w routerze. Nie potrzeba domeny
publicznej, hostingu ani konta Apple Developer. Domyślnie pilot sieciowy jest wyłączony.

## Certyfikat lokalny

1. Zarezerwuj stały adres LAN NUC-a w DHCP, np. `192.168.1.50`. Przykład zastąp
   rzeczywistym adresem. Certyfikat musi mieć ten adres w polu Subject Alternative Name.
2. Na zaufanym komputerze z OpenSSL uruchom poniższe polecenia w NOWYM prywatnym
   katalogu. Klucze nie mogą trafić do Git ani katalogu serwowanego przez WWW.
   Można skorzystać z Git Bash na Windows. Zmień adres w pliku `server.ext`.

```sh
umask 077
openssl genpkey -algorithm RSA -aes-256-cbc -pkeyopt rsa_keygen_bits:3072 -out root-ca.key
openssl req -x509 -new -sha256 -days 3650 -key root-ca.key -out root-ca.crt \
  -subj '/CN=Smart TV Home CA' \
  -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out server.key
openssl req -new -sha256 -key server.key -out server.csr -subj '/CN=Smart TV'
cat > server.ext <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:192.168.1.50
EOF
openssl x509 -req -sha256 -days 90 -in server.csr -CA root-ca.crt -CAkey root-ca.key \
  -CAcreateserial -out server.crt -extfile server.ext
openssl verify -CAfile root-ca.crt server.crt
openssl x509 -in root-ca.crt -noout -fingerprint -sha256
```

Hasło `root-ca.key` wpisujesz interaktywnie; nie zapisuj go w poleceniach. Klucz CA
zostaje offline na komputerze właściciela. Na NUC przenieś WYŁĄCZNIE `server.crt`
i `server.key`, bezpiecznym połączeniem, do katalogu konfiguracji tego dodatku:
`smart-tv/tls/` (w kontenerze `/config/smart-tv/tls/`). Użyj interfejsu HA do
plików konfiguracji aplikacji lub istniejącego bezpiecznego dostępu do hosta;
nie zmieniaj mapowania katalogów ani nie reinstaluj HAOS. Katalog 0700, klucz 0600.
Jeśli nie masz jeszcze bezpiecznego dostępu do tego katalogu, przygotuj go przed
włączeniem opcji pilota. Nigdy nie umieszczaj klucza w `/media`, `/www` ani w launcherze.

## Zaufanie iOS i konfiguracja dodatku

3. Przenieś sam publiczny `root-ca.crt` na iPhone np. przez AirDrop lub zaufane pliki.
   Porównaj odcisk SHA256 z wynikiem na komputerze. Zainstaluj profil w Ustawienia →
   Ogólne → VPN i zarządzanie urządzeniem. Następnie Ustawienia → Ogólne → To urządzenie →
   Ustawienia zaufania certyfikatów i włącz pełne zaufanie wyłącznie dla tego CA.
   Apple potwierdza, że ręczna instalacja sama nie włącza zaufania SSL:
   [instrukcja Apple](https://support.apple.com/en-gb/102390).
4. W opcjach dodatku ustaw:

```yaml
smart_tv_remote: true
smart_tv_origin: "https://192.168.1.50:8443"
smart_tv_bind: "192.168.1.50"
smart_tv_port: 8443
smart_tv_cert: "/config/smart-tv/tls/server.crt"
smart_tv_key: "/config/smart-tv/tls/server.key"
rest_ip: "127.0.0.1"
```

Origin to dokładny adres bez ścieżki i końcowego ukośnika. Host, adres certyfikatu
i adres używany w Safari muszą się zgadzać. Dla nazwy DNS lokalnego routera użyj
`DNS:nazwa` w SAN i tej samej nazwy w origin; nie zakładaj, że `.local` samo zadziała.
Zrestartuj tylko dodatek. Brak certyfikatu powoduje wyłączenie pilota HTTPS; lokalny
launcher nadal działa. W logach nie ma kluczy ani tokenów.

5. W Safari otwórz `https://192.168.1.50:8443/remote/`. Strona musi otworzyć się bez
   ostrzeżenia. Jeśli jest ostrzeżenie, popraw SAN, czas urządzeń, łańcuch lub zaufanie.
6. Na telewizorze otwórz Ustawienia → Sparuj telefon. PIN wygasa po 120 sekundach
   i po pięciu nieudanych próbach. Wpisz PIN i nazwę telefonu w pilocie. Kod jest
   jednorazowy; nie podawaj go osobom spoza gospodarstwa.
7. Safari → Udostępnij → Do ekranu początkowego. Uruchom ikonę i ponownie sparuj,
   jeśli Safari i aplikacja na ekranie początkowym nie współdzielą ciasteczka sesji.
   Sesja wygasa po 30 dniach; można ją odwołać na TV. Service worker przechowuje
   wyłącznie statyczną powłokę, a po utracie sieci nie steruje urządzeniami.

## Odnowienie i usunięcie

Certyfikat serwera ma 90 dni. Odnów go przed wygaśnięciem, używając tego samego CA
i aktualnego SAN; skopiuj nowy `server.crt` i zrestartuj dodatek. Zaufanie CA na iPhone
pozostaje. Po zmianie CA powtórz instalację/zaufanie i usuń stary profil z telefonu.
Po zgubieniu telefonu odwołaj jego sesję na TV. W razie ujawnienia klucza CA usuń
zaufanie do niego ze wszystkich urządzeń i utwórz nowe CA. Nie udostępniaj klucza CA.

Odtwarzanie DRM, touchpad na Netflixie, instalacja profilu iOS i zachowanie aplikacji
na ekranie początkowym wymagają testu na rzeczywistych urządzeniach.
