import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  LayoutAnimation,
  UIManager,
  FlatList,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- KONFIGURASJON ---
const USE_MOCK_API = false; // Sett til true hvis API limit nås
const SERVICE_INTERVAL = 15000; // 15k km service intervall

// --- 1. TYPER & INTERFACES ---

type LogType = 'service' | 'repair' | 'upgrade' | 'inspection' | 'fuel' | 'system';
type ViewType = 'onboarding' | 'garage' | 'vault' | 'logs' | 'config';

interface ServiceLog {
  id: string;
  title: string;
  date: string;
  mileage: number;
  cost: number;
  type: LogType;
  notes: string;
  isSystemEvent: boolean;
}

interface Document {
  id: string;
  title: string;
  expiry: string;
  uri: string;
  type: 'license' | 'insurance' | 'vognkort' | 'receipt';
}

interface Car {
  plate: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  nextEU: string;
  mileage: number;
  // Specs (Nullable)
  trailerWeight: string | null;
  tireSizeFront: string | null;
  tireSizeRear: string | null; // ⬅️ BAKDEKK
  fuelType: string | null;
  power: string | null;
  cylinderVolume: string | null;
  kw: number;
}

// --- 2. TEMA (MIDNATT UTGAVE) ---

const THEME = {
  bg: '#0F172A',
  card: '#1E293B',
  cardBorder: '#334155',
  primary: '#38BDF8',
  secondary: '#020617', // ⬅️ brukt i header
  accent: '#F472B6',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  text: '#F8FAFC',
  textDim: '#94A3B8',
};

// --- 3. LOKALISERING (NORSK SOM STANDARD) ---
const T = {
  // Common
  appName: 'Hanskerommet',
  km: 'km',
  kr: 'kr',
  save: 'Lagre',
  cancel: 'Avbryt',
  // Navigation
  garage: 'Garasje',
  vault: 'Dokumenthvelv',
  logs: 'Hendelser',
  config: 'Innstillinger',
  // Onboarding/General
  platePlaceholder: 'EK 12345',
  startEngine: 'START MOTOR',
  techSpecs: 'TEKNISKE SPESIFIKASJONER',
  tapToEdit: 'TRYKK FOR Å ENDRE',
  euControl: 'EU-Kontroll',
  totalCost: 'Totalkostnad',
  mileage: 'Kilometerstand',
  power: 'Effekt',
  fuel: 'Drivstoff',
  tires: 'Dekk',
  towing: 'Tilhengervekt',
  year: 'Årsmodell',
  // Logs
  newEntry: 'Ny Hendelse',
  cost: 'Kostnad',
  notes: 'Notater',
  // Vault
  uploadDoc: '+ Last Opp Dokument',
  setPasscode: 'Velg Passord',
  enterPasscode: 'Angi Passord',
};

// --- MOCK (valgfritt) ---

const getMockCar = (plate: string): Car => ({
  plate: plate.toUpperCase(),
  make: 'Škoda',
  model: 'Octavia 4x4',
  year: 2008,
  vin: 'TMBXX123456789',
  nextEU: '2026-06-30',
  mileage: 250000,
  trailerWeight: '1600 kg',
  tireSizeFront: '205/55R16',
  tireSizeRear: '205/55R16',
  fuelType: 'Diesel',
  power: '140 HK',
  cylinderVolume: '1968 cm³',
  kw: 103,
});

// --- 4. API SERVICE ---

const fetchCarDetails = async (plate: string): Promise<Car> => {
  if (USE_MOCK_API) {
    return new Promise((r) => setTimeout(() => r(getMockCar(plate)), 700));
  }

  try {
    const API_KEY = process.env.EXPO_PUBLIC_API_KEY;
    const url = `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${plate.replace(
      /\s/g,
      ''
    )}`;

    const response = await fetch(url, {
      headers: {
        'SVV-Authorization': `Apikey ${API_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const raw = (await response.json())?.kjoretoydataListe?.[0];
    if (!raw) throw new Error('Kjøretøy ikke funnet.');

    const tech = raw.godkjenning?.tekniskGodkjenning?.tekniskeData;
    const gen = tech?.generelt;
    const engine = tech?.motorOgYtelse?.motor?.[0];

    const kw = engine?.ytelse?.maksimalNettoEffekt || 0;
    const hp = kw ? Math.round(kw * 1.341) : null;
    const powerStr = hp ? `${hp} HK` : null;
    const volume = engine?.slagvolum || null;

    const axles = tech?.dekkOgFelg?.aksler || [];
    const frontTire =
      axles.find((a: any) => a.plasseringAksel === 'AKSEL_1')?.dekkdimensjon || null;
    const rearTire =
      axles.find((a: any) => a.plasseringAksel === 'AKSEL_2')?.dekkdimensjon || frontTire;

    return {
      plate: raw.kjennemerke?.[0]?.kjennemerke || plate,
      make: gen?.merke?.[0]?.merke || 'Ukjent',
      model: gen?.handelsbetegnelse?.[0] || 'Ukjent',
      year: raw.forstegangsregistrering?.registrertForstegangNorgeDato
        ? new Date(raw.forstegangsregistrering.registrertForstegangNorgeDato).getFullYear()
        : 0,
      vin: raw.kjoretoyId?.understellsnummer || 'Ukjent',
      nextEU: raw.periodiskKjoretoyKontroll?.kontrollfrist || 'N/A',
      mileage: 0,
      trailerWeight: tech?.vekter?.tilhengervektMedBrems
        ? `${tech.vekter.tilhengervektMedBrems} kg`
        : null,
      tireSizeFront: frontTire,
      tireSizeRear: rearTire,
      fuelType: engine?.drivstoff?.[0]?.drivstoffKode?.kodeNavn || null,
      power: powerStr,
      kw: kw,
      cylinderVolume: volume ? `${volume} cm³` : null,
    };
  } catch (error) {
    console.error('FETCH ERROR:', error);
    throw error;
  }
};

// --- 5. APP STATE & CORE LOGIC ---

// Alle tilgjengelige spesifikasjoner for brukeren å velge
const ALL_SPECS = [
  { key: 'power', label: T.power, icon: 'flash' },
  { key: 'fuelType', label: T.fuel, icon: 'water' },
  { key: 'tireSizeFront', label: T.tires + ' (F)', icon: 'disc' },
  { key: 'tireSizeRear', label: T.tires + ' (B)', icon: 'disc' },
  { key: 'trailerWeight', label: T.towing, icon: 'car-sport' },
  { key: 'cylinderVolume', label: 'Volum', icon: 'speedometer' },
  { key: 'year', label: T.year, icon: 'calendar-number' },
  { key: 'vin', label: 'VIN', icon: 'finger-print' },
];

export default function App() {
  const [view, setView] = useState<ViewType>('onboarding');
  const [car, setCar] = useState<Car | null>(null);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);

  // Customization State
  const [selectedSpecs, setSelectedSpecs] = useState(
    ALL_SPECS.slice(0, 6).map((s) => s.key)
  );

  // Modals/UI State
  const [modals, setModals] = useState({
    addLog: false,
    mileage: false,
    editSpec: false,
    manageSpecs: false,
  });
  const [specToEdit, setSpecToEdit] = useState<{ key: keyof Car; label: string } | null>(
    null
  );
  const [isPasscodeSet, setIsPasscodeSet] = useState<string | null>(null);
  const [vaultAccess, setVaultAccess] = useState<'locked' | 'unlocked' | 'setup'>(
    'locked'
  );

  // --- ACTIONS ---

  const handleRegister = async (plate: string) => {
    try {
      const data = await fetchCarDetails(plate);
      setCar(data);
      const initLog: ServiceLog = {
        id: Date.now().toString(),
        title: 'Kjøretøy lagt til',
        date: new Date().toISOString().split('T')[0],
        mileage: 0,
        cost: 0,
        type: 'system',
        notes: 'Importert via SVV API.',
        isSystemEvent: true,
      };
      setLogs([initLog]);
      setView('garage');
    } catch (e) {
      Alert.alert(T.appName, 'Klarte ikke hente kjøretøydata.');
    }
  };

  const handleUpdateMileage = (newKm: number, manual: boolean = false) => {
    if (!car) return;
    const oldKm = car.mileage;
    setCar({ ...car, mileage: newKm });

    if (manual && newKm !== oldKm) {
      const auditLog: ServiceLog = {
        id: Date.now().toString(),
        title: 'Kilometerstand korrigert',
        date: new Date().toISOString().split('T')[0],
        mileage: newKm,
        cost: 0,
        type: 'system',
        notes: `Manuell oppdatering: ${oldKm} km -> ${newKm} km`,
        isSystemEvent: true,
      };
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLogs((prev) => [auditLog, ...prev]);
    }
  };

  const handleUpdateSpec = (val: string) => {
    if (!car || !specToEdit) return;
    setCar({ ...car, [specToEdit.key]: val } as Car);
    setModals((prev) => ({ ...prev, editSpec: false }));
  };

  const handleAddLog = (log: ServiceLog) => {
    if (car && log.mileage > car.mileage) {
      handleUpdateMileage(log.mileage, true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLogs((prev) => [log, ...prev]);
    setModals((prev) => ({ ...prev, addLog: false }));
  };

  // VAULT ACTIONS
  const handleVaultAccess = (passcode: string) => {
    if (!isPasscodeSet) {
      setIsPasscodeSet(passcode);
      setVaultAccess('unlocked');
    } else if (passcode === isPasscodeSet) {
      setVaultAccess('unlocked');
    } else {
      Alert.alert(T.appName, 'Feil passord.');
    }
  };

  const handleDocumentUpload = async (docTitle: string, docExpiry: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        const newDoc: Document = {
          id: Date.now().toString(),
          title: docTitle,
          expiry: docExpiry,
          uri: result.assets[0].uri,
          type: 'receipt',
        };
        setDocs((prev) => [...prev, newDoc]);
        return true;
      }
      return false;
    } catch (e) {
      Alert.alert('Feil', 'Klarte ikke laste opp dokument. Sjekk tillatelser.');
      return false;
    }
  };

  const handleDocumentView = async (uri: string) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(T.appName, 'Deling er ikke tilgjengelig på denne enheten.');
        return;
      }
      await Sharing.shareAsync(uri);
    } catch (e) {
      Alert.alert('Feil', 'Klarte ikke åpne dokumentet.');
    }
  };

  // 👇 viktig: hooks under her kjøres ALLTID, uansett view

  const isOnboarding = view === 'onboarding' || !car;

  const currentView = useMemo(() => {
    if (!car) return null;

    switch (view) {
      case 'garage':
        return (
          <GarageScreen
            car={car}
            logs={logs}
            onOpenMileage={() =>
              setModals((prev) => ({
                ...prev,
                mileage: true,
              }))
            }
            onEditSpec={(key: keyof Car, label: string) => {
              setSpecToEdit({ key, label });
              setModals((prev) => ({ ...prev, editSpec: true }));
            }}
            selectedSpecs={selectedSpecs}
          />
        );
      case 'vault':
        return (
          <VaultScreen
            docs={docs}
            vaultAccess={vaultAccess}
            setAccess={setVaultAccess}
            handleAccess={handleVaultAccess}
            handleUpload={handleDocumentUpload}
            onView={handleDocumentView}
          />
        );
      case 'logs':
        return <TimelineScreen logs={logs} />;
      case 'config':
        return (
          <ConfigScreen
            car={car}
            onDelete={() => {
              Alert.alert(
                'Slett kjøretøy',
                'Er du sikker på at du vil slette dette kjøretøyet og alle data?',
                [
                  { text: 'Avbryt', style: 'cancel' },
                  {
                    text: 'Slett',
                    style: 'destructive',
                    onPress: () => {
                      setCar(null);
                      setLogs([]);
                      setDocs([]);
                      setView('onboarding');
                    },
                  },
                ]
              );
            }}
            onOpenSpecManager={() =>
              setModals((prev) => ({ ...prev, manageSpecs: true }))
            }
          />
        );
      default:
        return null;
    }
  }, [view, car, logs, docs, vaultAccess, selectedSpecs]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }}>
        {isOnboarding ? (
          // Onboarding vises inni samme komponent, men HOOKS er allerede kalt
          <Onboarding onRegister={handleRegister} />
        ) : (
          <>
            {/* HEADER */}
            <View style={styles.headerContainer}>
              <View style={styles.headerTopRow}>
                <View>
                  <Text style={styles.headerModel}>{car?.model}</Text>
                  <Text style={styles.headerBrand}>
                    {car?.make} {car?.year}
                  </Text>
                </View>
                <View style={styles.plateBadge}>
                  <Text style={styles.plateText}>{car?.plate}</Text>
                </View>
              </View>
            </View>

            {/* CONTENT */}
            <View style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                <View style={{ paddingHorizontal: 20 }}>{currentView}</View>
              </ScrollView>
            </View>

            {/* TAB BAR + FAB */}
            <View style={styles.tabBarContainer}>
              <View style={styles.tabBar}>
                <TabBtn
                  icon="car-sport"
                  label={T.garage}
                  active={view === 'garage'}
                  onPress={() => setView('garage')}
                />
                <TabBtn
                  icon="file-tray-full"
                  label={T.vault}
                  active={view === 'vault'}
                  onPress={() => {
                    setView('vault');
                    if (!isPasscodeSet) setVaultAccess('setup');
                    else setVaultAccess('locked');
                  }}
                />
                <View style={{ width: 60 }} />
                <TabBtn
                  icon="list"
                  label={T.logs}
                  active={view === 'logs'}
                  onPress={() => setView('logs')}
                />
                <TabBtn
                  icon="cog"
                  label={T.config}
                  active={view === 'config'}
                  onPress={() => setView('config')}
                />
              </View>
              <TouchableOpacity
                style={styles.fab}
                activeOpacity={0.8}
                onPress={() =>
                  setModals((prev) => ({
                    ...prev,
                    addLog: true,
                  }))
                }
              >
                <LinearGradient
                  colors={[THEME.primary, '#0284c7']}
                  style={styles.fabGradient}
                >
                  <Ionicons name="add" size={32} color="white" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* MODALS – bare når vi IKKE er i onboarding */}
            <AddLogModal
              visible={modals.addLog}
              onClose={() =>
                setModals((prev) => ({
                  ...prev,
                  addLog: false,
                }))
              }
              onSave={handleAddLog}
            />
            <SimpleInputModal
              visible={modals.mileage}
              title={`Oppdater ${T.mileage}`}
              placeholder={car?.mileage.toString()}
              keyboard="numeric"
              onClose={() =>
                setModals((prev) => ({
                  ...prev,
                  mileage: false,
                }))
              }
              onSave={(val: string) =>
                handleUpdateMileage(parseInt(val, 10) || 0, true)
              }
            />
            <SimpleInputModal
              visible={modals.editSpec}
              title={`Endre ${specToEdit?.label || ''}`}
              placeholder="Ny verdi..."
              keyboard="default"
              onClose={() =>
                setModals((prev) => ({
                  ...prev,
                  editSpec: false,
                }))
              }
              onSave={handleUpdateSpec}
            />
            <ManageSpecsModal
              visible={modals.manageSpecs}
              onClose={() =>
                setModals((prev) => ({
                  ...prev,
                  manageSpecs: false,
                }))
              }
              allSpecs={ALL_SPECS}
              selectedSpecs={selectedSpecs}
              onSave={setSelectedSpecs}
            />
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

// --- SKJERMER (Screens) ---

const GarageScreen = ({
  car,
  logs,
  onOpenMileage,
  onEditSpec,
  selectedSpecs,
}: any) => {
  const daysToEu = car.nextEU && car.nextEU !== 'N/A'
    ? Math.ceil(
        (new Date(car.nextEU).getTime() - new Date().getTime()) /
          (1000 * 3600 * 24)
      )
    : NaN;

  const euStatus =
    isNaN(daysToEu) || car.nextEU === 'N/A'
      ? 'warning'
      : daysToEu < 30
      ? 'danger'
      : daysToEu < 120
      ? 'warning'
      : 'success';

  const kmUntilService = SERVICE_INTERVAL - (car.mileage % SERVICE_INTERVAL || 0);

  const totalCost = logs.reduce((a: number, b: ServiceLog) => a + (b.cost || 0), 0);

  return (
    <View style={{ marginTop: -20 }}>
      <TouchableOpacity style={styles.mileageBtn} onPress={onOpenMileage}>
        <Ionicons name="speedometer-outline" size={20} color={THEME.primary} />
        <Text style={styles.mileageText}>
          {car.mileage.toLocaleString()} {T.km}
        </Text>
        <Ionicons
          name="pencil"
          size={12}
          color={THEME.textDim}
          style={{ marginLeft: 8 }}
        />
      </TouchableOpacity>

      <View style={styles.alertsRow}>
        <AlertCard
          color={THEME[euStatus as keyof typeof THEME]}
          icon="calendar"
          title={T.euControl}
          value={
            isNaN(daysToEu)
              ? 'Ukjent'
              : daysToEu < 0
              ? 'FORFALDT'
              : `${daysToEu} dager`
          }
          sub={car.nextEU}
        />
        <AlertCard
          color={THEME.primary}
          icon="construct"
          title="Neste Service"
          value={`${kmUntilService} km`}
          sub={`Hver ${SERVICE_INTERVAL} km`}
        />
        <AlertCard
          color={THEME.success}
          icon="cash"
          title={T.totalCost}
          value={`${totalCost.toLocaleString()} ${T.kr}`}
          sub="Totalt"
        />
      </View>

      <View style={styles.section}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={styles.sectionTitle}>{T.techSpecs}</Text>
          <Text style={{ color: THEME.textDim, fontSize: 10 }}>{T.tapToEdit}</Text>
        </View>

        <View style={styles.grid}>
          {selectedSpecs.map((key: keyof Car) => {
            const spec = ALL_SPECS.find((s) => s.key === key);
            if (!spec) return null;
            return (
              <SpecBox
                key={key}
                label={spec.label}
                value={car[key]}
                icon={spec.icon}
                onPress={() => onEditSpec(key, spec.label)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
};

const VaultScreen = ({
  docs,
  vaultAccess,
  setAccess,
  handleAccess,
  handleUpload,
  onView,
}: any) => {
  const [passcode, setPasscode] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docExpiry, setDocExpiry] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  if (vaultAccess !== 'unlocked') {
    return (
      <PasscodeModal
        status={vaultAccess}
        passcode={passcode}
        setPasscode={setPasscode}
        onAccess={handleAccess}
      />
    );
  }

  const handleUploadPress = async () => {
    if (!docTitle) {
      return Alert.alert('Feil', 'Må angi en tittel for dokumentet.');
    }
    setIsUploading(true);
    const success = await handleUpload(docTitle, docExpiry);
    setIsUploading(false);
    if (success) {
      setDocTitle('');
      setDocExpiry('');
    }
  };

  return (
    <View style={styles.screenContainer}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{T.vault}</Text>
        <TouchableOpacity onPress={() => setAccess('locked')}>
          <Text style={{ color: THEME.textDim, fontSize: 14 }}>LÅS 🔒</Text>
        </TouchableOpacity>
      </View>

      {/* Upload Form */}
      <View style={[styles.card, { marginBottom: 20 }]}>
        <Text style={styles.inpLabel}>TITTEL PÅ DOKUMENTET</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={THEME.textDim}
          placeholder="F.eks. Forsikringspolise 2024"
          value={docTitle}
          onChangeText={setDocTitle}
        />
        <Text style={styles.inpLabel}>UTLØPSDATO (Valgfritt)</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={THEME.textDim}
          placeholder="ÅÅÅÅ-MM-DD"
          value={docExpiry}
          onChangeText={setDocExpiry}
        />

        <TouchableOpacity
          style={styles.uploadBtn}
          onPress={handleUploadPress}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator color="black" />
          ) : (
            <Text style={styles.btnTxt}>{T.uploadDoc}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Document List */}
      <FlatList
        data={docs}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.docRow} onPress={() => onView(item.uri)}>
            <View
              style={[
                styles.docIcon,
                {
                  backgroundColor:
                    item.type === 'insurance' ? THEME.success : THEME.primary,
                },
              ]}
            >
              <Ionicons name="document-text" size={24} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docTitle}>{item.title}</Text>
              <Text style={styles.docSub}>
                Utløper: {item.expiry || 'Ingen dato'}
              </Text>
            </View>
            <Ionicons name="eye-outline" size={20} color={THEME.textDim} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text
            style={{
              color: THEME.textDim,
              textAlign: 'center',
              marginTop: 30,
            }}
          >
            Ingen dokumenter lagret.
          </Text>
        }
      />
    </View>
  );
};

const TimelineScreen = ({ logs }: { logs: ServiceLog[] }) => (
  <View style={styles.screenContainer}>
    <Text style={styles.pageTitle}>{T.logs}</Text>
    <FlatList
      data={logs}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ paddingBottom: 100 }}
      renderItem={({ item }) => <LogRow log={item} />}
      ListEmptyComponent={
        <Text style={{ color: THEME.textDim, marginTop: 20 }}>
          Ingen hendelser enda.
        </Text>
      }
    />
  </View>
);

const ConfigScreen = ({ car, onDelete, onOpenSpecManager }: any) => (
  <View style={styles.screenContainer}>
    <Text style={styles.pageTitle}>{T.config}</Text>

    <View style={styles.configSection}>
      <Text style={styles.configHeader}>KORRIGERING & INNSTILLINGER</Text>
      <TouchableOpacity style={styles.configRow} onPress={onOpenSpecManager}>
        <Text style={styles.configLabel}>Tilpass spesifikasjoner</Text>
        <Ionicons name="chevron-forward" size={18} color={THEME.primary} />
      </TouchableOpacity>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Språk</Text>
        <Text style={styles.configValue}>NORSK</Text>
      </View>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Valuta</Text>
        <Text style={styles.configValue}>NOK</Text>
      </View>
    </View>

    <View style={styles.configSection}>
      <Text style={styles.configHeader}>FARESONE</Text>
      <TouchableOpacity style={styles.dangerBtn} onPress={onDelete}>
        <Ionicons name="trash" size={20} color="white" />
        <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 10 }}>
          SLETT KJØRETØY
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);

// --- MODALS & COMPONENTS ---

const PasscodeModal = ({ status, passcode, setPasscode, onAccess }: any) => {
  const isSetup = status === 'setup';
  const title = isSetup ? T.setPasscode : T.enterPasscode;
  const btnText = isSetup ? T.save : 'Lås Opp';

  return (
    <Modal visible={true} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalPopup}>
          <Text style={styles.popupTitle}>{title}</Text>
          <TextInput
            style={[styles.input, { fontSize: 24, textAlign: 'center' }]}
            placeholder="****"
            placeholderTextColor={THEME.textDim}
            value={passcode}
            onChangeText={setPasscode}
            keyboardType="numeric"
            secureTextEntry
            maxLength={4}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.popupBtn, { backgroundColor: THEME.primary, marginTop: 10 }]}
            onPress={() => onAccess(passcode)}
            disabled={passcode.length !== 4}
          >
            <Text style={styles.btnTxt}>{btnText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const ManageSpecsModal = ({
  visible,
  onClose,
  allSpecs,
  selectedSpecs,
  onSave,
}: any) => {
  const [tempSelected, setTempSelected] = useState(selectedSpecs);

  const toggleSpec = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTempSelected((prev: string[]) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      } else if (prev.length < 6) {
        return [...prev, key];
      }
      return prev;
    });
  };

  const handleSave = () => {
    if (tempSelected.length !== 6) {
      return Alert.alert('Velg 6', 'Vennligst velg nøyaktig 6 spesifikasjoner.');
    }
    onSave(tempSelected);
    onClose();
  };

  useEffect(() => {
    setTempSelected(selectedSpecs);
  }, [selectedSpecs, visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.sheetContainer, { backgroundColor: THEME.bg }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.modalH1}>Tilpass Oversikt (6/6)</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: THEME.primary }}>Lukk</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={styles.grid}>
            {allSpecs.map((spec: any) => {
              const isActive = tempSelected.includes(spec.key);
              return (
                <TouchableOpacity
                  key={spec.key}
                  style={[
                    styles.specChip,
                    isActive && { backgroundColor: THEME.primary },
                  ]}
                  onPress={() => toggleSpec(spec.key)}
                  disabled={!isActive && tempSelected.length >= 6}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isActive ? THEME.bg : THEME.text },
                    ]}
                  >
                    {spec.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={[styles.mainBtn, { marginTop: 30 }]} onPress={handleSave}>
            <Text style={styles.btnTxt}>
              Lagre Valg ({tempSelected.length}/6)
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const SimpleInputModal = ({
  visible,
  title,
  placeholder,
  keyboard,
  onClose,
  onSave,
}: any) => {
  const [val, setVal] = useState('');
  useEffect(() => {
    setVal('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalPopup}>
          <Text style={styles.popupTitle}>{title}</Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={THEME.textDim}
            value={val}
            onChangeText={setVal}
            keyboardType={keyboard}
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.popupBtn, { backgroundColor: THEME.card }]}
            >
              <Text style={{ color: THEME.text }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSave(val)}
              style={[styles.popupBtn, { backgroundColor: THEME.primary }]}
            >
              <Text style={styles.btnTxt}>Lagre</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const AddLogModal = ({ visible, onClose, onSave }: any) => {
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<LogType>('service');

  const handleSave = () => {
    onSave({
      id: Date.now().toString(),
      title: title || type.charAt(0).toUpperCase() + type.slice(1),
      cost: parseInt(cost, 10) || 0,
      mileage: parseInt(mileage, 10) || 0,
      date: new Date().toISOString().split('T')[0],
      type,
      notes,
      isSystemEvent: false,
    });
    setTitle('');
    setCost('');
    setMileage('');
    setNotes('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.sheetContainer, { backgroundColor: THEME.bg }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.modalH1}>{T.newEntry}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: THEME.primary }}>Lukk</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.inpLabel}>TYPE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 20 }}
          >
            {['service', 'repair', 'upgrade', 'fuel', 'inspection'].map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, type === t && styles.chipActive]}
                onPress={() => setType(t as LogType)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: type === t ? THEME.bg : THEME.text },
                  ]}
                >
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.inpLabel}>TITTEL</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={THEME.textDim}
            placeholder="F.eks. Oljeskift med filter"
            value={title}
            onChangeText={setTitle}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inpLabel}>
                {T.cost} ({T.kr})
              </Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={THEME.textDim}
                placeholder="0"
                keyboardType="numeric"
                value={cost}
                onChangeText={setCost}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inpLabel}>
                {T.mileage} ({T.km})
              </Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={THEME.textDim}
                placeholder="Valgfritt"
                keyboardType="numeric"
                value={mileage}
                onChangeText={setMileage}
              />
            </View>
          </View>
          <Text style={styles.inpLabel}>{T.notes}</Text>
          <TextInput
            style={[styles.input, { height: 100 }]}
            multiline
            placeholderTextColor={THEME.textDim}
            placeholder="Notater, delenummer, etc..."
            value={notes}
            onChangeText={setNotes}
          />

          <TouchableOpacity style={styles.mainBtn} onPress={handleSave}>
            <Text style={styles.btnTxt}>{T.save} Hendelse</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

// --- SMÅ KOMPONENTER ---

const TabBtn = ({
  icon,
  label,
  active,
  onPress,
}: {
  icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity style={styles.tabBtn} onPress={onPress}>
    <Ionicons
      name={icon}
      size={22}
      color={active ? THEME.primary : THEME.textDim}
    />
    <Text
      style={[
        styles.tabLabel,
        { color: active ? THEME.primary : THEME.textDim },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const AlertCard = ({
  color,
  icon,
  title,
  value,
  sub,
}: {
  color: string;
  icon: any;
  title: string;
  value: string;
  sub: string;
}) => (
  <View style={[styles.alertCard, { borderTopColor: color }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
      <Ionicons name={icon} size={14} color={color} style={{ marginRight: 4 }} />
      <Text style={styles.alertTitle}>{title}</Text>
    </View>
    <Text style={[styles.alertValue, { color }]}>{value}</Text>
    <Text style={styles.alertSub}>{sub}</Text>
  </View>
);

const SpecBox = ({
  label,
  value,
  icon,
  onPress,
}: {
  label: string;
  value: any;
  icon: any;
  onPress: () => void;
}) => (
  <TouchableOpacity style={styles.specBox} onPress={onPress}>
    <Ionicons name={icon} size={18} color={THEME.primary} />
    <Text style={styles.specValue}>
      {value === null || value === undefined || value === '' ? '—' : String(value)}
    </Text>
    <Text style={styles.specLabel}>{label}</Text>
  </TouchableOpacity>
);

const LogRow = ({ log }: { log: ServiceLog }) => {
  const iconMap: Record<LogType, any> = {
    service: 'construct',
    repair: 'hammer',
    upgrade: 'flash',
    inspection: 'search',
    fuel: 'flame',
    system: 'information-circle',
  };

  const color = log.isSystemEvent ? THEME.accent : THEME.primary;

  return (
    <View style={styles.logRow}>
      <View style={styles.logTimelineLine} />
      <View style={styles.logIconParams}>
        <Ionicons
          name={iconMap[log.type] || 'information-circle'}
          size={16}
          color={color}
        />
      </View>
      <View style={styles.logContent}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}
        >
          <Text style={styles.logTitle}>{log.title}</Text>
          <Text style={styles.logDate}>{log.date}</Text>
        </View>
        {!!log.notes && <Text style={styles.logNotes}>{log.notes}</Text>}
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}
        >
          <Text style={styles.logCost}>
            {log.cost ? `${log.cost.toLocaleString()} ${T.kr}` : ''}
          </Text>
          <Text style={styles.logDate}>
            {log.mileage ? `${log.mileage.toLocaleString()} ${T.km}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
};

// --- ONBOARDING ---

const Onboarding = ({ onRegister }: { onRegister: (plate: string) => void }) => {
  const [plate, setPlate] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    const trimmed = plate.trim();
    if (!trimmed) {
      return Alert.alert(T.appName, 'Skriv inn registreringsnummer.');
    }
    try {
      setLoading(true);
      await onRegister(trimmed.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.onboardingWrapper}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={styles.onboardingTitle}>{T.appName}</Text>
          <Text style={styles.onboardingSubtitle}>
            Legg inn skiltet ditt, så henter vi data fra Statens vegvesen.
          </Text>

          <Text style={styles.inpLabel}>REGISTRERINGSNUMMER</Text>
          <TextInput
            style={styles.input}
            placeholder={T.platePlaceholder}
            placeholderTextColor={THEME.textDim}
            autoCapitalize="characters"
            value={plate}
            onChangeText={setPlate}
          />

          <TouchableOpacity
            style={[styles.mainBtn, { marginTop: 10 }]}
            onPress={handlePress}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="black" />
            ) : (
              <Text style={styles.btnTxt}>{T.startEngine}</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

// --- STYLES ---

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },

  // Header
  headerContainer: {
    backgroundColor: THEME.secondary,
    paddingTop: Platform.OS === 'android' ? 50 : 0,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: 'black',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    marginHorizontal: -20,
  },
  headerTopRow: {
    paddingHorizontal: 40,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBrand: {
    color: THEME.textDim,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 14,
  },
  headerModel: { fontSize: 26, color: 'white', fontWeight: '800' },
  plateBadge: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateText: { color: 'black', fontWeight: 'bold', fontSize: 16 },

  // Screen container
  screenContainer: {
    flex: 1,
    paddingTop: 24,
    paddingBottom: 40,
  },

  // Garage
  mileageBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.card,
    alignSelf: 'flex-start',
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  mileageText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },
  alertsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    marginTop: 10,
  },
  alertCard: {
    width: 140,
    backgroundColor: THEME.card,
    marginRight: 12,
    padding: 16,
    borderRadius: 16,
    borderTopWidth: 4,
    borderTopRightRadius: 4,
    shadowColor: 'black',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  alertTitle: { color: THEME.textDim, fontWeight: 'bold', fontSize: 12 },
  alertValue: { fontSize: 18, fontWeight: '800', marginVertical: 4 },
  alertSub: { color: THEME.textDim, fontSize: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  specBox: {
    width: '31%',
    backgroundColor: THEME.card,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    minHeight: 90,
    justifyContent: 'space-between',
  },
  specLabel: { color: THEME.textDim, fontSize: 10, marginTop: 'auto' },
  specValue: { color: 'white', fontWeight: 'bold', fontSize: 13, marginTop: 8 },

  // Tabs & Nav
  tabBarContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    height: 70,
  },
  tabBar: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: THEME.card,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  tabLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  fab: {
    position: 'absolute',
    top: -25,
    left: '50%',
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: THEME.primary,
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: THEME.bg,
  },

  // Forms
  input: {
    backgroundColor: THEME.card,
    color: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  inpLabel: {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  mainBtn: {
    backgroundColor: THEME.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnTxt: { fontWeight: 'bold', color: 'black' },

  // Modals
  sheetContainer: { flex: 1, backgroundColor: THEME.bg, paddingTop: 60 },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: THEME.cardBorder,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 40,
  },
  modalPopup: {
    backgroundColor: THEME.bg,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  popupTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  popupBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  modalH1: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
  },

  // Vault
  card: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: 'white',
    marginBottom: 4,
  },
  pageSub: { color: THEME.textDim, marginBottom: 24 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  docTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  docSub: { color: THEME.textDim, fontSize: 12 },
  uploadBtn: {
    backgroundColor: THEME.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },

  // Config
  configSection: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  configHeader: {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  configLabel: { color: 'white' },
  configValue: { color: THEME.textDim },
  dangerBtn: {
    backgroundColor: 'rgba(248, 113, 113, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
  },

  // Misc
  section: { paddingHorizontal: 0 },
  sectionTitle: {
    color: THEME.textDim,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 1,
  },
  logRow: { flexDirection: 'row', marginBottom: 20 },
  logTimelineLine: {
    width: 2,
    backgroundColor: THEME.cardBorder,
    position: 'absolute',
    left: 15,
    top: 0,
    bottom: -20,
  },
  logIconParams: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.bg,
    borderWidth: 2,
    borderColor: THEME.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  logContent: {
    flex: 1,
    marginLeft: 12,
    backgroundColor: THEME.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  logTitle: { color: 'white', fontWeight: 'bold' },
  logDate: { color: THEME.textDim, fontSize: 10 },
  logNotes: { color: THEME.textDim, fontSize: 12, marginVertical: 4 },
  logCost: { color: THEME.success, fontSize: 12, fontWeight: 'bold' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: THEME.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  chipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: THEME.text },
  specChip: {
    width: '30%',
    backgroundColor: THEME.card,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  // Onboarding
  onboardingWrapper: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  onboardingTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: 'white',
    marginBottom: 8,
  },
  onboardingSubtitle: {
    color: THEME.textDim,
    marginBottom: 24,
    fontSize: 14,
  },
});
