# Build e release del fork

Queste istruzioni riguardano `LuigiVessella/yuzic`. La distribuzione originale
`yuzicapp/yuzic` mantiene il proprio flusso, descritto in
[upstream-release-reference.md](upstream-release-reference.md).

## Identita e aggiornamenti Android

Sia le prove da `develop` sia le release da `master` installano **Yuzic Test**:

- package: `com.arinora.rawarr.test`;
- schema: `yuzic-test://`;
- architettura: ARM64;
- firma: il certificato di test gia usato dagli APK installati sul telefono.

L'icona della fork e blu (`#2563EB`): `app.json` usa
`assets/images/logo-fork-blue.png`, mentre le risorse native gia generate sono
in `android/` e `ios/`. Tenerle sincronizzate e necessario perche la CI non
esegue `expo prebuild`; `assets/images/logo.png` resta l'icona originale.

Ogni compilazione produce un nuovo file APK, ma Android lo installa come
aggiornamento della stessa app: account, impostazioni e download rimangono.
L'app ufficiale, `com.arinora.rawarr`, resta separata. Non disinstallare Yuzic
Test per aggiornarla: usare `adb install -r`.

`fork.config.json` mantiene identita, impronta SHA-256 del certificato e
`versionCode`. Non cambiarli per distinguere develop/master. Lo script rifiuta
un certificato diverso. Il keystore corrente e `android/app/debug.keystore`,
gia presente nel repository: e una firma di test, usata per questi APK personali,
non la firma dell'app ufficiale o una credenziale di pubblicazione sugli store.

Il codice interno iniziale del fork e **56**, superiore al 55 dei precedenti
APK locali. `prepare-release.ps1` lo incrementa e lo salva nel repository;
non viene derivato da data, hash o contatore GitHub. Le build di prova e release
della stessa revisione condividono quel codice: Android consente di aggiornare
con un codice uguale, impedisce normalmente quello inferiore. Passare a una
vecchia release non e quindi un aggiornamento automatico. Questa politica vale
solo per il package `.test`; le release ufficiali continuano a interrogare gli store.

## Branch e versioni

- `develop`: modifiche e prove, anche con codice non committato.
- `master`: codice verificato, promosso da `develop` tramite PR.
- `origin`: il fork personale; un eventuale `upstream` identifica il progetto originale.
- Versioni e tag del fork: `2.17.1-lv.1`, `2.17.1-lv.2`, poi ad esempio
  `2.18.0-lv.1` quando si integra quella base upstream. Nessun prefisso `v`.

La versione di release e identica in `package.json`, `package-lock.json`, tag,
nome del file APK e versione Android visibile. Le prove aggiungono `-test`
alla sola versione Android visibile. Non serve incrementare la versione a ogni
prova: la preparazione della prossima release aggiorna insieme versione e codice.
Il suffisso `-lv.N` e una prerelease secondo SemVer; "release del fork" qui
indica una distribuzione personale verificata, non una release ufficiale Yuzic.

Un tag identifica un commit, non le modifiche non committate. I checkpoint
`checkpoint/...` esistenti restano checkpoint e non attivano la pubblicazione.

## Strumenti Windows senza Android Studio

Servono Node.js 22, JDK 17, MSYS2 UCRT64 (`make`, `sh` e `gcc`) e Android SDK da riga di comando con:

```text
platforms;android-36
build-tools;36.0.0
ndk;27.1.12297006
cmake;3.22.1
```

Impostare `FORK_JAVA_HOME` se il JDK non viene trovato e `ANDROID_HOME` per un
SDK in una posizione diversa da `%LOCALAPPDATA%/Android/Sdk`. `JAVA_HOME_17_X64`
e `JAVA_HOME` sono riconosciuti. Sulla macchina originale vengono riconosciuti
anche JDK e Node temporanei predisposti durante il debug; su una nuova macchina
installare gli strumenti e aggiungere Node a `PATH`.
Il builder aggiunge automaticamente `C:\msys64\ucrt64\bin` e `C:\msys64\usr\bin`
al `PATH` per compilare FFmpeg in `yuzic-engine` 1.3.2. Se MSYS2 e installato
altrove, impostare `FORK_MSYS2_ROOT` alla sua cartella principale. La CI installa
gli stessi strumenti con `msys2/setup-msys2`.
I file in `patches/` restano LF anche sui checkout Windows: la verifica delle
patch usa `git apply --reverse --check` e richiede terminazioni coerenti.

Per una prima installazione delle dipendenze:

```powershell
npm ci --omit=dev
```

Se servono anche i test JS, `npm install --include=dev` preserva i file nativi
gia compilati nelle dipendenze. Prima di un APK autonomo rimuovere i soli
pacchetti di sviluppo senza reinstallare quelli di produzione:

```powershell
npm prune --omit=dev --ignore-scripts
```

Il postinstall dell'installazione originale deve aver applicato le patch;
`--ignore-scripts` qui evita di rieseguire hook durante la sola rimozione.
`typescript` resta tra le dipendenze di produzione: Expo lo usa anche durante
il bundle APK per risolvere gli alias definiti in `tsconfig.json`.
Il builder rifiuta `expo-dev-client` e `expo-dev-launcher` installati, per non
includere il launcher di sviluppo nell'APK. In CI si usa `npm ci --omit=dev`
e si verificano esplicitamente tutte le patch.

## Provare il codice su develop

```powershell
cd C:\Users\vesse\Progetti\yuzic
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\fork\build-apk.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\fork\build-apk.ps1
```

Non effettua checkout, commit, tag o upload. Include il codice corrente, anche
le modifiche non committate. Produce:

```text
build/Yuzic-Test-<versione-package.json>-arm64.apk
build/Yuzic-Test-<versione-package.json>-arm64.json
```

Il JSON registra commit, presenza di modifiche locali, canale, versione,
codice Android, firma e hash dell'APK. Il nome del file delle prove puo essere
riutilizzato: non e una release immutabile.

Il vecchio `build/local-test/build.ps1` su questa macchina e un rimando allo
script versionato. Rimane utilizzabile, ma `build/` e ignorata da Git: dopo un
clone usare il comando in `tools/fork/`.

Il builder usa Gradle con Kotlin in-process e Codegen esplicito prima di
`assembleRelease`, necessari per i problemi incontrati nella build Windows.
Modifica temporaneamente app.json e i file Android per l'identita `.test`, poi
ripristina i byte originali in `finally`. Un lock impedisce due build simultanee
nello stesso checkout. I backup sono in `.local/fork/native-backup/`: dopo una
terminazione forzata del processo verificare il diff prima di ripristinarli;
non sovrascrivere modifiche successive. I daemon Gradle possono essere fermati
con `android/gradlew.bat --stop` quando non servono build in corso.

## Installazione USB o Wi-Fi

Per il Wi-Fi, usare le porte attualmente mostrate dal telefono: associazione
e connessione hanno porte diverse, che possono cambiare. Il codice e richiesto
interattivamente, non va conservato negli script.

```powershell
adb pair IP_TELEFONO:PORTA_ASSOCIAZIONE
adb connect IP_TELEFONO:PORTA_CONNESSIONE
adb devices -l
$version = (Get-Content .\package.json -Raw | ConvertFrom-Json).version
adb -s IP_TELEFONO:PORTA_CONNESSIONE install -r ".\build\Yuzic-Test-$version-arm64.apk"
adb -s IP_TELEFONO:PORTA_CONNESSIONE shell am start -n com.arinora.rawarr.test/com.arinora.rawarr.MainActivity
```

Per USB sostituire l'indirizzo con il seriale mostrato da `adb devices -l`.

## Preparare una release, senza crearla subito

Quando il codice e verificato, su `develop`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\fork\prepare-release.ps1 -Version 2.17.1-lv.1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\fork\prepare-release.ps1 -Version 2.17.1-lv.1
```

Lo script cambia solo versione di package/lockfile, incrementa il codice in
`fork.config.json` e crea `docs/releases/2.17.1-lv.1.md`. Non committa o tagga.
Completare le note, rimuovendo i TODO e indicando modifiche, test, problemi noti
e, quando disponibile, commit upstream di base. Rivedere e committare questi
file con le modifiche testate, poi promuovere `develop` a `master` tramite PR.
La versione attuale non e stata incrementata solo per installare questo flusso.

## Creare la release locale su master

Da un `master` aggiornato e completamente committato:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\fork\release-apk.ps1
```

Verifica versione `-lv.N`, note complete, worktree pulito e assenza del tag;
compila l'APK con versione visibile esatta, controlla i metadati e crea:

```text
releases/2.17.1-lv.1/
  Yuzic-Test-2.17.1-lv.1-arm64.apk
  release.json
  SHA256.txt
  notes.md
```

Solo dopo la build riuscita crea un tag Git annotato sul commit verificato.
La cartella `releases/` e ignorata da Git; le note in `docs/releases/` sono
versionate. Una release esistente non viene sovrascritta: correggere con una
nuova versione. Il comando non pubblica su GitHub, Play o TestFlight.

## GitHub: pubblicazione esplicita del tag

Per pubblicare successivamente il tag gia creato:

```powershell
git push origin 2.17.1-lv.1
```

Oppure `release-apk.ps1 -Publish` crea la release locale e invia il nuovo tag
in un solo comando; non usarlo per una versione gia creata localmente.
Il flag invia il tag solo al fork personale configurato.

`fork-apk-release.yml` reagisce solo ai tag `*-lv.*` del fork, verifica che
tag e package coincidano e che il commit appartenga a `origin/master`.
Ricompila e verifica lo stesso package, codice e certificato, conserva gli
artifact e crea una **bozza** GitHub con APK, note, hash e metadati. Il file
APK ricompilato in CI puo avere un hash diverso da quello locale: ogni set di
artifact mantiene il proprio SHA256. Rivedere la bozza e pubblicarla dall'UI
di GitHub quando pronta. Gli allegati di una release esistente non vengono
sostituiti dai rerun. `-ExistingTag -SkipBuild` e il percorso interno di
confezionamento CI e verifica che i metadati corrispondano al commit pulito.

I vecchi workflow di distribuzione store sono limitati a `yuzicapp/yuzic`.
Nel fork un cambio di versione su master non pubblica sugli store e non crea
automaticamente un tag. La CI controlla anche il branch `develop` e verifica
il tooling del fork in un repository temporaneo, senza compilare Android.

## Istruzioni per agenti e manutenzione

`AGENTS.md` in radice e la fonte condivisa per le chat che lavorano nella repo.
`CLAUDE.md` e `GEMINI.md` vi rimandano. La configurazione globale Codex sulla
macchina originale rimanda a questi documenti; non viene sincronizzata da Git.
Le istruzioni aggiornate vengono lette all'avvio di una nuova sessione.

Documentare nella stessa modifica comportamenti, configurazioni e procedure
nuovi o cambiati. Tenere le regole durevoli in AGENTS e i dettagli qui,
preservando le istruzioni e il lavoro non correlati gia presenti. Non creare
release, commit, tag o push solo per verificare il tooling del fork.

Verifiche del tooling, senza compilare l'app o toccare i branch reali:

Richiedono Node e le dipendenze della repo (per il parser YAML), oltre a
JDK/SDK per la verifica preliminare della firma. Le prove di versionamento
e tag usano un repository temporaneo isolato sotto `build/`, eliminato alla fine.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\fork\test-release-tools.ps1
```

In CI su Linux il test viene eseguito con PowerShell 7 e
`-SkipAndroidPreflight`: salta le prove che richiedono SDK/JDK Windows.
Il job di release Windows verifica invece la firma durante la build effettiva.
