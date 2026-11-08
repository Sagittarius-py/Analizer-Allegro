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
- **Wybór okresu**: 30, 90 lub 365 dni danych albo cały okres. Zakres dni liczy się wstecz od najnowszej daty znalezionej w zaimportowanych raportach, a nie od dzisiejszej daty.
- **Wykres przychodu i kosztów** dla wybranego okresu (najeżdżanie myszą pokazuje wartości dla konkretnego dnia).
- **Struktura zamówień** — wykres kołowy aktywne vs. anulowane.
- **Największe kategorie kosztów** — pasek porównawczy (prowizje, dostawa, reklama itd.).
- **Najnowsze importy** — historia ostatnio wczytanych plików z datami zakresu danych.
- **Szybkie akcje** — skróty do importu i raportów.

Przycisk **„Odśwież dane”** ponownie pobiera wszystkie dane z bazy (przydatne po imporcie nowego pliku).

Przychód i wykresy finansowe pokazują PLN. Kwoty w innych walutach są podane oddzielnie i nie są automatycznie przeliczane ani dodawane do PLN.

## Zamówienia

- Tabela wszystkich zaimportowanych zamówień: ID, data, kwota po odjęciu powiązanych kosztów Allegro, status (przetłumaczony na polski, anulowane wyróżnione kolorem). Podstawowa kwota i suma rozpoznanych kosztów są widoczne pod wynikiem i po najechaniu na niego.
- Kliknij nagłówek kolumny, aby posortować zamówienia; kolejne kliknięcie zmienia kierunek. Sortowanie uwzględnia wszystkie wyniki przed stronicowaniem.
- Filtry daty początkowej i końcowej ograniczają zamówienia do wybranego zakresu (włącznie); działają razem z wyszukiwarką po ID zamówienia, rynku (marketplace) lub dostawcy realizacji.
- Stronicowanie (50 zamówień na stronę, przyciski „Poprzednia”/„Następna”).
- Kliknięcie **„Szczegóły”** pokazuje dane zamówienia oraz wszystkie powiązane operacje rozliczeniowe (prowizje, dostawa itd.) z tego raportu rozliczeń, które udało się dopasować po identyfikatorze zamówienia. Kwota przy każdej operacji to uznanie minus obciążenie: koszt jest ujemny, zwrot opłaty dodatni.
- Jeśli operacje zawierają ID oferty, szczegóły pokazują oferty występujące w rozliczeniach tego zamówienia oraz przypisane do nich prowizje, dostawę i pozostałe opłaty. To powiązanie pochodzi z raportu rozliczeń; nie jest pełną listą pozycji sprzedaży i nie zawiera ilości ani ceny każdej pozycji. Opłaty dostawy bez ID oferty pozostają widoczne na poziomie zamówienia, ale nie są przypisywane do konkretnego produktu.
- Kwota na liście jest tylko kwotą płatności pomniejszoną o rozpoznane, powiązane koszty Allegro. Nie uwzględnia kosztu zakupu produktu ani opłat, których nie dało się przypisać do zamówienia, więc nie jest zyskiem.
- W szczegółach widać też podsumowanie kwot rzeczywiście naliczonych przez Allegro dla tego zamówienia: **prowizja**, **opłaty za dostawę** (obie netto, czyli po odjęciu ewentualnych zwrotów), liczba **przesyłek** (unikalne numery nadania) oraz **prowizja / kwota płatności** w procentach.

### Jak czytać prowizję

Aplikacja **nie wylicza prowizji ani opłat Smart! samodzielnie** — pokazuje kwoty, które Allegro naliczyło w raporcie rozliczeń. Stawki zależą od kategorii oferty, rodzaju konta i dostawy, mogą mieć część procentową i stałą kwotę oraz mogą się zmieniać, więc aplikacja nie przyjmuje żadnych założeń o ich wysokości.

Według materiałów Allegro prowizja procentowa jest liczona od ceny towaru plus kosztu dostawy opłacanego przez kupującego (np. 6% od 100 zł towaru i 18 zł dostawy to 7,08 zł). Przy dostawie Smart! dostawa jest dla kupującego bezpłatna, więc prowizja obejmuje tylko towar. Przy kilku przedmiotach w jednej transakcji koszt dostawy jest dzielony na przedmioty, a prowizja liczona osobno dla każdego.

Wskaźnik **prowizja / kwota płatności** to zwykły iloraz tych dwóch liczb z raportów. Kwota płatności w raporcie zamówień może zawierać dostawę opłaconą przez kupującego, a raport nie rozdziela jej od ceny towaru, więc wskaźnik jest orientacyjny i nie musi odpowiadać stawce prowizji z cennika Allegro. Z tego samego powodu **przychód** na Pulpicie i w trendach jest sumą kwot płatności zamówień (bez anulowanych), a nie samej wartości towarów.

### Allegro Smart! — opłaty za dostawę

Dla zamówień Smart! (operacje z `Zamówienie Smart!: Tak`) w szczegółach zamówienia pojawia się panel z:

- **opłatą Smart! naliczoną** — suma obciążeń za dostawę (bez operacji „Opłata dodatkowa…”, które są usługami dodatkowymi),
- **zwrotem opłaty Smart!** — uznania na tych operacjach (Allegro zwraca opłatę za przesyłkę, gdy klient zwróci zakup formularzem zwrotu lub nie odbierze paczki; zwrot obejmuje tylko opłatę podstawową),
- **opłatą wg cennika konta zwykłego** i **różnicą** do tego, co naliczono.

Cennik konta zwykłego według pomocy Allegro, zależny od wartości zamówienia:

| Wartość zamówienia | Opłata za przesyłkę |
|---|---|
| 30,00–44,99 zł | 1,59 zł |
| 45,00–64,99 zł | 3,19 zł |
| 65,00–99,99 zł | 5,19 zł |
| 100,00–149,99 zł | 7,89 zł |
| od 150,00 zł | 9,99 zł |

Zamówienie z kilkoma przesyłkami: poniżej 150 zł każda przesyłka kosztuje tyle samo; od 150 zł pierwsza kosztuje 9,99 zł, a każda kolejna 7,89 zł. Liczba przesyłek to liczba unikalnych numerów nadania. Wartość zamówienia przyjmujemy z kwoty płatności w raporcie zamówień.

Uwagi dotyczące porównania:

- Panel jest **orientacyjny**. Konto firmowe ma inne warunki, a zamówienia wysłane innymi metodami niż w cenniku mogą mieć inne stawki — wtedy różnica będzie różna od zera. To nie oznacza błędu w aplikacji ani w rozliczeniu.
- Przy płatności przy odbiorze Allegro doliczy 4,99 zł za pobranie, ale raporty nie zawierają formy płatności, więc aplikacja tego nie uwzględnia.
- Dla zamówień poniżej 30 zł cennik nie podaje opłaty, więc panel pokazuje „Brak progu / brak danych”.

Warunki uzyskania oznaczenia Smart! w ofercie (konto zwykłe): jakość sprzedaży wyższa niż Neutralny (lub co najmniej Neutralny na wszystkich kontach), brak zaległości w rozliczeniach z Allegro, metoda Paczkomaty InPost z ceną wysyłki do 10,95 zł oraz ustawione warunki zwrotów z adresem w Polsce. Oznaczenia nie mają ogłoszenia ani oferty w kategoriach: fajerwerki, mleka modyfikowane początkowe i leki weterynaryjne bez recepty. Aplikacja **nie sprawdza** tych warunków; pole „Oferta korzysta z dostawy SMART” w produktach jest ustawiane ręcznie.

## Produkty i VAT

Katalog ofert (produktów) używany do liczenia marży:

- Produkty pojawiają się tu **automatycznie** po imporcie raportu rozliczeń (na podstawie nazwy i ID oferty), ale bez kosztu zakupu — trzeba go uzupełnić ręcznie.
- Koszt netto można uzupełnić lub zmienić bez otwierania szczegółów: wpisz kwotę bezpośrednio w polu **„Zakup netto”**. Zapis następuje po naciśnięciu Enter lub opuszczeniu pola; pozostałe dane i dotychczasowe potwierdzenie VAT są zachowane.
- Przy pierwszym uzupełnieniu kosztu, jeśli cena sprzedaży nie jest ustawiona, aplikacja proponuje cenę netto i brutto według domyślnych stawek VAT oraz zapisanych progów zysku i marży. To propozycja oparta na domyślnych stawkach — nie potwierdza VAT; zweryfikuj ustawienia dla produktu przed użyciem wyliczeń.
- Formularz pozwala ustawić dla każdej oferty: ID oferty, nazwę, SKU, koszt zakupu netto, cenę sprzedaży netto, stawkę VAT zakupu i sprzedaży, procent odliczenia VAT, walutę i notatki.
- Ustawienia pozwalają określić domyślną walutę oraz domyślne stawki VAT zakupu/sprzedaży i procent odliczenia. Są one wstępnie wypełniane w nowych produktach i ofertach wykrytych w imporcie; same w sobie **nie potwierdzają** prawidłowości stawki ani prawa do odliczenia.
- Po zaznaczeniu **„VAT zweryfikowany”** aplikacja przelicza automatycznie koszt zakupu brutto oraz szacowaną cenę sprzedaży brutto.
- W katalogu widać liczbę zamówień, z którymi powiązano operacje danej oferty. Szczegóły produktu pokazują sumę opłat Allegro z zaimportowanych rozliczeń oraz zakres dat tych operacji; jest to suma historyczna, nie koszt jednostkowy.
- Kliknij nagłówek tabeli, aby posortować produkty według nazwy, kosztu zakupu, szacowanego zysku lub ceny brutto.
- Pokazywany zysk i marża są szacunkiem opartym na cenie sprzedaży i koszcie zakupu. Nie odejmują opłat Allegro ani Ads, dlatego zielony/czerwony status nie jest potwierdzeniem faktycznego zysku netto. Nowo wykryte oferty wymagają uzupełnienia kosztu zakupu i danych sprzedażowych.
- Wyszukiwarka filtruje po nazwie, ID oferty lub SKU.
- Możliwość edycji i usunięcia produktu z katalogu (usunięcie nie usuwa historycznych operacji rozliczeniowych, tylko wpis kosztowy).

## Koszty

Szczegółowa analiza finansowa łącząca oba raporty:

- Podsumowanie: liczba zamówień (aktywne/anulowane), przychód zamówień aktywnych w PLN, koszty netto z rozliczeń, saldo na koniec wybranego zakresu.
- Informacja o dopasowaniu operacji rozliczeniowych do zamówień (ile powiązano, ile bez dopasowania) — pomaga ocenić kompletność danych przed wyciąganiem wniosków o zysku.
- **Koszty według kategorii** — lista z sumą i liczbą operacji dla każdej kategorii (prowizja, dostawa, reklama, abonament, inne).
- **Opłaty Allegro według oferty** — 10 ofert z największymi kosztami wraz z informacją, czy w katalogu produktów uzupełniono koszt zakupu i stawki VAT.
- **Trend przychodu i kosztów** — konfigurowalny zakres dni (1–3650), wykresy oraz tabela dzienna (przychód / koszty netto / różnica).
- Nagłówki tabel trendu oraz tabeli ofert w szczegółach zamówienia sortują dane po klikniętej kolumnie; kolejne kliknięcie zmienia kierunek.
- Filtry daty początkowej i końcowej ograniczają podsumowanie, koszty, produkty oraz trendy do wybranego okresu; ten zakres ma pierwszeństwo przed liczbą dni wykresu. Wyczyść zakres dat, aby wrócić do ustawienia liczby dni.

Zakres dni na tej stronie również liczony jest od najnowszej daty w zaimportowanych raportach. Przychody w walutach innych niż PLN są widoczne osobno; nie wchodzą do porównania z kosztami rozliczeń w PLN. Zwroty są przypisywane do okresu na podstawie zakresu dat raportu zamówień, ponieważ plik nie udostępnia daty dla każdej pozycji zwrotu.

## Raporty

Zapisywanie i przeglądanie migawek analizy dla wybranego okresu:

- Formularz: nazwa raportu, data od, data do → **„Zapisz raport”** oblicza i zapisuje metryki, koszty wg kategorii, trend oraz podsumowanie źródeł wyłącznie dla podanego zakresu.
- Podgląd pokazuje zamówienia, przychód PLN, koszty Allegro i orientacyjną różnicę. Różnica nie jest zyskiem netto: nie odejmuje kosztu zakupu produktów, podatku ani kosztów spoza raportów.
- Przychody w innych walutach są pokazane oddzielnie i nie są przeliczane na PLN.
- **Eksport CSV** zapisuje wybrany raport wraz z metrykami, przychodami wg waluty, kosztami kategorii i dziennym trendem.
- Filtry daty początkowej i końcowej na liście pokazują zapisane raporty, których okres pokrywa się z wybranym zakresem.
- Lista zapisanych raportów pozwala na podgląd, eksport, przypinanie (oznaczenie 📌 dla ważnych raportów) i usuwanie. Starsze migawki z poprzednich wersji aplikacji nadal można otworzyć, ale zawierają tylko wcześniejsze podstawowe metryki.

## Ustawienia

- **Domyślna waluta** — 3-literowy kod (np. PLN), z walidacją formatu.
- **Automatyczne kopie przy imporcie** — włącza tworzenie kopii zapasowej bazy danych przed każdym importem.
- **Domyślny folder kopii** — ścieżka na dysku (przycisk „Wybierz” otwiera okno wyboru folderu); aplikacja waliduje, czy folder istnieje i oferuje jego utworzenie.
- **Informacje o bazie danych** — liczba zamówień, liczba operacji rozliczeniowych, rozmiar pliku bazy i jego pełna ścieżka.
- **„Eksportuj kopię bazy”** — ręczny zapis kopii pliku `.db` w wybranym miejscu.
- **„Przywróć kopię bazy”** — wybierz wcześniejszy plik `.db`/`.sqlite`. Aplikacja sprawdzi jego integralność i zgodność, a przed zastąpieniem obecnych danych automatycznie zapisze ich kopię. Jeśli kontrola kopii się nie powiedzie, obecna baza pozostanie bez zmian.
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
