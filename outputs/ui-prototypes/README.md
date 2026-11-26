# Prototipi Yuzic

`yuzic-studio.html` è la seconda proposta; `yuzic-ui.html` conserva la prima.
Sono frammenti interattivi per la preview in conversazione, non schermate React Native.
Le immagini sono incorporate per evitare dipendenze di rete nella preview.

## Percorsi esplorabili

La proposta Studio comprende Home, libreria, album posseduti ed esterni,
raccolta artisti e pagine artista, ricerca con risultati locali/esterni,
playlist e preferiti, player e coda, download sul dispositivo, richieste,
generi, impostazioni, aspetto, fonti e riepilogo hub.
Il carosello offre undici punti di partenza; le altre pagine si raggiungono
con i controlli dell'app. La playing bar apre il player e mantiene il brano
selezionato durante la navigazione. Coda, avanzamento, preferiti, tema,
ricerca, pausa download e conferma richiesta hanno stati locali dimostrativi.
L'eventuale ripristino di stato dell'host conserva le scelte della preview.

Copertine e ritratti sono reali; conteggi, playlist, richieste, progressi dei
download e configurazioni sono esempi. Il contenuto musicale è un sottoinsieme,
non una replica del catalogo completo. Non vengono riprodotti audio, inviati
download, modificati servizi o lette credenziali. Il pannello testi non
include testi di canzoni. Le icone restano nella famiglia Lucide dell'app.

## Direzione

- Copertine e ritratti reali, gerarchia tipografica netta, superfici sobrie.
- Logo della fork e accento blu; ordine tab Home / Cerca / Libreria.
- Libreria come riferimento per la riproduzione. Gli album esterni dichiarano
  anteprime e richieste prima delle azioni, senza simulare streaming completo.
- Una sola sezione per gli artisti simili. Provenienza accanto al contenuto
  quando serve a capire cosa si può ascoltare o richiedere.

## Corrispondenza con il codice

Il mockup riproduce in HTML la grammatica dei componenti esistenti, senza
importarli: `DetailHeader` e `DetailActionRow` (shuffle / play / download),
`MediaTile`, `AlbumRow`, `TopTrackRow`, `LibraryEntryRows`, playing bar,
`EntityOptionsSheet` e `GetReviewSheet`. Le icone sono Lucide, come nell'app;
non è necessario introdurre una nuova libreria. La ricerca nella raccolta
Artisti è una proposta di filtro locale. Le richieste sono simulate e non
invocano SoulSync. Le schermate mostrano una selezione di contenuti di esempio.

La discografia esterna mantiene la navigazione dedicata già presente.
La proposta richiede soprattutto modifiche a layout, titoli e spaziature;
non introduce API, sincronizzazioni o algoritmi di raccomandazione.
L'implementazione dovrà usare i token `constants/design` e i hook del tema,
non copiare i valori CSS del mockup. Rispetto agli screenshot il contenuto
è espanso verticalmente per la revisione; sul dispositivo resta scorrevole.

## Riferimenti e immagini

- Spotify Design, principi di rilevanza e coerenza:
  https://medium.com/spotify-design/introducing-spotifys-new-design-principles-c99c58ed7558
- Apple Music, navigazione della libreria:
  https://support.apple.com/guide/iphone/play-music-iph0138fb328/27/ios/27
- TIDAL, scoperta nella Home:
  https://support.tidal.com/hc/en-us/articles/29710779228817-My-New-Arrivals
- Ritratti e copertine: API pubblica Deezer, `/search/artist` e `/search/album`;
  copie ridotte in `assets/`, solo per questa proposta. Restano immagini dei
  rispettivi titolari; non sono nuove risorse da distribuire con l'app.

Verificati sintassi JavaScript, generazione iniziale degli undici template,
navigazione a diciassette destinazioni e stati di ricerca, selezione brano,
player, pausa download, tema e richiesta. I controlli sono stati eseguiti sul
codice dei template, senza verifica visiva in un browser. La preview non è
una verifica del rendering React Native e non è stata eseguita una build.
