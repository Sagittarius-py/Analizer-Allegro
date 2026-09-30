# Allegro Profit Analyzer — instrukcja użytkownika

Aplikacja desktopowa (Electron + React) do analizy sprzedaży, kosztów i zysków na podstawie raportów CSV pobranych z Allegro. Wszystkie dane są przetwarzane i przechowywane **wyłącznie lokalnie** na Twoim komputerze, w bazie SQLite — aplikacja nie wysyła danych do internetu.

## Spis treści

1. [Jak to działa — ogólna zasada](#jak-to-działa--ogólna-zasada)
2. [Skąd wziąć raporty z Allegro](#skąd-wziąć-raporty-z-allegro)
3. [Import raportów krok po kroku](#import-raportów-krok-po-kroku)
4. [Pulpit (Dashboard)](#pulpit-dashboard)
5. [Zamówienia](#zamówienia)
6. [Produkty i VAT](#produkty-i-vat)
7. [Koszty](#koszty)
8. [Raporty](#raporty)
9. [Ustawienia](#ustawienia)
10. [Gdzie są przechowywane dane](#gdzie-są-przechowywane-dane)
11. [Najczęstsze problemy](#najczęstsze-problemy)

---

## Jak to działa — ogólna zasada

Aplikacja opiera się na dwóch niezależnych typach raportów pobieranych z panelu sprzedawcy Allegro:

| Typ raportu | Co zawiera | Rozpoznawane po nagłówku kolumn |
|---|---|---|
| **Raport zamówień** | lista zamówień (status, kwota, waluta, data) oraz pozycje zwrotów | `Type, OrderId, OrderDate, SellerStatus, ...` |
| **Raport rozliczeń (billing)** | pojedyncze operacje finansowe: prowizje, opłaty za dostawę, reklamy, abonament, saldo | `Data; Nazwa oferty; Identyfikator oferty; Typ operacji; Uznania; Obciążenia; Saldo; ...` |

Format pliku jest wykrywany **automatycznie** na podstawie nagłówka — nie musisz ręcznie wskazywać, który to raport. Po imporcie:

- zamówienia trafiają do tabeli `orders`,
- operacje rozliczeniowe trafiają do tabeli `billing_operations` i są automatycznie **łączone z zamówieniami** po identyfikatorze zawartym w kolumnie „Szczegóły operacji”,
- każda operacja kosztowa jest przypisywana do kategorii (prowizja, dostawa, reklama, abonament, inne) na podstawie wbudowanego słownika typów operacji,
- jeśli w rozliczeniach pojawi się oferta (produkt), której nie ma jeszcze w katalogu produktów, zostaje ona **automatycznie dodana** do katalogu (z kosztem zakupu = brak, do uzupełnienia ręcznie).

Na tej podstawie aplikacja liczy przychody, koszty, saldo, marże i trendy — widoczne na Pulpicie oraz stronach Koszty/Produkty.

## Skąd wziąć raporty z Allegro

1. Zaloguj się w panelu sprzedawcy Allegro.
2. Pobierz **raport zamówień** (Sprzedaż → Zamówienia → Eksport) — plik CSV z kolumnami typu `Type,OrderId,OrderDate,...`.
3. Pobierz **raport rozliczeń** (Płatności/Rozliczenia → Eksport) — plik CSV z kolumnami `Data;Nazwa oferty;...` rozdzielony średnikami.
4. Zapisz oba pliki na dysku (np. w folderze `Raports/`, tak jak przykładowe pliki dołączone do repozytorium).

## Import raportów krok po kroku

1. Otwórz zakładkę **Import danych** w menu bocznym.
2. Wybierz zakładkę **Zamówienia** lub **Rozliczenia** (to tylko podpowiedź UI — plik i tak zostanie rozpoznany automatycznie).
3. Dodaj pliki na jeden z trzech sposobów:
   - przeciągnij i upuść plik CSV na obszar importu,
   - kliknij **„Wybierz pliki”** (otwiera natywne okno wyboru plików systemu Windows),
   - kliknij **„Przeglądaj komputer”** i wskaż plik z dysku.
4. Kliknij **„Podgląd raportu”**, aby zobaczyć bez zapisu do bazy: liczbę zamówień/operacji, sumę obciążeń oraz przykładowe rekordy.
5. Kliknij **„Importuj dane”**, aby zapisać dane do lokalnej bazy. Aplikacja poinformuje o wyniku dla każdego pliku:
   - **Zaimportowano** — dane zapisane, widoczna liczba dodanych zamówień/operacji oraz ewentualnie liczba nowo wykrytych produktów,
   - **Duplikat** — plik o identycznej zawartości (suma kontrolna) był już wcześniej importowany, nic nie zostało zapisane ponownie,
   - **Błąd** — np. nierozpoznany format pliku, plik pusty lub uszkodzony.

> Wskazówka: pliki można importować w dowolnej kolejności i wielokrotnie — importer sam wykrywa duplikaty po zawartości pliku, więc ponowny import tego samego raportu jest bezpieczny.

## Pulpit (Dashboard)

Strona startowa z podsumowaniem:

- **Karty metryk**: liczba zamówień, suma przychodów, bieżące saldo na koncie Allegro (z mini-wykresami trendu).
- **Wykres przychodu i kosztów** z ostatnich 30 dni (najeżdżanie myszą pokazuje wartości dla konkretnego dnia).
- **Struktura zamówień** — wykres kołowy aktywne vs. anulowane.
- **Największe kategorie kosztów** — pasek porównawczy (prowizje, dostawa, reklama itd.).
- **Najnowsze importy** — historia ostatnio wczytanych plików z datami zakresu danych.
- **Szybkie akcje** — skróty do importu i raportów.

Przycisk **„Odśwież dane”** ponownie pobiera wszystkie dane z bazy (przydatne po imporcie nowego pliku).

## Zamówienia

- Tabela wszystkich zaimportowanych zamówień: ID, data, kwota, status (przetłumaczony na polski, anulowane wyróżnione kolorem).
- Wyszukiwarka po ID zamówienia, rynku (marketplace) lub dostawcy realizacji.
- Stronicowanie (50 zamówień na stronę, przyciski „Poprzednia”/„Następna”).
- Kliknięcie **„Szczegóły”** pokazuje dane zamówienia oraz wszystkie powiązane operacje rozliczeniowe (prowizje, dostawa itd.) z tego raportu rozliczeń, które udało się dopasować po identyfikatorze zamówienia.

## Produkty i VAT

Katalog ofert (produktów) używany do liczenia marży:

- Produkty pojawiają się tu **automatycznie** po imporcie raportu rozliczeń (na podstawie nazwy i ID oferty), ale bez kosztu zakupu — trzeba go uzupełnić ręcznie.
- Formularz pozwala ustawić dla każdej oferty: ID oferty, nazwę, SKU, koszt zakupu netto, cenę sprzedaży netto, stawkę VAT zakupu i sprzedaży, procent odliczenia VAT, walutę i notatki.
- Po zaznaczeniu **„VAT zweryfikowany”** aplikacja przelicza automatycznie koszt zakupu brutto oraz szacowaną cenę sprzedaży brutto.
- Wyszukiwarka filtruje po nazwie, ID oferty lub SKU.
- Możliwość edycji i usunięcia produktu z katalogu (usunięcie nie usuwa historycznych operacji rozliczeniowych, tylko wpis kosztowy).

## Koszty

Szczegółowa analiza finansowa łącząca oba raporty:

- Podsumowanie: liczba zamówień (aktywne/anulowane), przychód zamówień aktywnych, koszty netto z rozliczeń, bieżące saldo Allegro — każde z zakresem dat danego raportu źródłowego.
- Informacja o dopasowaniu operacji rozliczeniowych do zamówień (ile powiązano, ile bez dopasowania) — pomaga ocenić kompletność danych przed wyciąganiem wniosków o zysku.
- **Koszty według kategorii** — lista z sumą i liczbą operacji dla każdej kategorii (prowizja, dostawa, reklama, abonament, inne).
- **Opłaty Allegro według oferty** — 10 ofert z największymi kosztami wraz z informacją, czy w katalogu produktów uzupełniono koszt zakupu i stawki VAT.
- **Trend przychodu i kosztów** — konfigurowalny zakres dni (1–3650), wykresy oraz tabela dzienna (przychód / koszty netto / różnica).

## Raporty

Zapisywanie i przeglądanie „migawek” bieżących metryk dla wybranego okresu:

- Formularz: nazwa raportu, data od, data do → **„Zapisz raport”** zapisuje aktualne podsumowanie metryk (z Pulpitu) jako migawkę JSON powiązaną z tym zakresem dat.
- Lista zapisanych raportów z możliwością: podglądu (surowe dane metryk), przypinania (oznaczenie 📌 dla ważnych raportów) i usuwania.

## Ustawienia

- **Domyślna waluta** — 3-literowy kod (np. PLN), z walidacją formatu.
- **Automatyczne kopie przy imporcie** — włącza tworzenie kopii zapasowej bazy danych przed każdym importem.
- **Domyślny folder kopii** — ścieżka na dysku (przycisk „Wybierz” otwiera okno wyboru folderu); aplikacja waliduje, czy folder istnieje i oferuje jego utworzenie.
- **Informacje o bazie danych** — liczba zamówień, liczba operacji rozliczeniowych, rozmiar pliku bazy i jego pełna ścieżka.
- **„Eksportuj kopię bazy”** — ręczny zapis kopii pliku `.db` w wybranym miejscu.
- **Przywracanie stanu fabrycznego** — nieodwracalnie usuwa wszystkie zaimportowane dane (zamówienia, rozliczenia, katalog produktów, zapisane raporty, ustawienia). Wymaga zaznaczenia świadomej zgody oraz wpisania dokładnie frazy `USUŃ WSZYSTKIE DANE`. Przed usunięciem aplikacja **automatycznie tworzy kopię zapasową** bazy — jeśli kopia się nie powiedzie, reset nie zostanie wykonany.

## Gdzie są przechowywane dane

Baza danych SQLite znajduje się w katalogu danych aplikacji systemu Windows, standardowo:

```
%APPDATA%\allegro-profit-analyzer\allegro-profit-analyzer\database.db
```

Dokładną ścieżkę zawsze widać na stronie **Ustawienia** w sekcji „Baza danych”. Zaleca się regularne tworzenie kopii zapasowych (ręcznie przez „Eksportuj kopię bazy” lub automatycznie po włączeniu tej opcji w ustawieniach).

## Najczęstsze problemy

- **„Nie rozpoznano formatu pliku”** — plik nie ma oczekiwanego nagłówka kolumn. Upewnij się, że to oryginalny, niezmodyfikowany eksport CSV z Allegro (raport zamówień lub rozliczeń).
- **„Duplikat”** przy imporcie — plik o identycznej zawartości był już zaimportowany; to nie jest błąd, dane nie zostały zdublowane.
- **Brak przychodu/kosztów mimo importu** — sprawdź, czy zaimportowano **oba** raporty (zamówienia i rozliczenia) oraz czy ich zakresy dat się pokrywają — informację o tym pokazuje strona Koszty.
- **Produkt bez kosztu zakupu** — nowe oferty wykryte automatycznie z rozliczeń nie mają ustawionego kosztu zakupu; uzupełnij je w zakładce „Produkty i VAT”, aby zobaczyć poprawne marże.
