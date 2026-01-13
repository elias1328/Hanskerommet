import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  ActivityIndicator,
  FlatList,
  Modal,
  Animated,
  LayoutAnimation,
  UIManager,
  ImageBackground,
  Dimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; // Ensure you have expo-linear-gradient installed, or remove if standard Expo
import { BlurView } from 'expo-blur';
import PagerView from 'react-native-pager-view';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Swipeable } from 'react-native-gesture-handler';
import { getBrandLogo } from '../../brand-logos';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- CONFIGURATION ---
const USE_MOCK_API = false; // Set to true if you hit API limits

// --- 1. TYPES ---

type LogType = string;

interface ServiceLog {
  id: string;
  title: string;
  date: string; // ISO YYYY-MM-DD
  mileage: number;
  cost: number;
  type: LogType;
  notes: string;
  isSystemEvent: boolean; // If true, user cannot delete easily
}

interface Doc {
  id: string;
  title: string;
  expiry: string;
  type: 'license' | 'insurance' | 'vognkort';
}

interface Car {
  plate: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  nextEU: string;
  mileage: number;
  // Specs (Nullable so we can edit them)
  topSpeed: string | null;
  engineLiters: string | null;
  totalWeight: string | null;
  seats: string | null;
  fuelType: string | null;
}

const formatDistance = (km: number, units: 'km' | 'mi') => {
  if (units === 'mi') {
    const miles = km * 0.621371;
    return `${miles.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi`;
  }
  return `${km.toLocaleString()} km`;
};

const toKilometers = (value: number, units: 'km' | 'mi') =>
  units === 'mi' ? Math.round(value / 0.621371) : Math.round(value);

// --- 2. THEMES ---

const LIGHT_THEME = {
  scheme: 'light' as const,
  bg: '#F2F2F7',
  card: '#FFFFFF',
  cardBorder: '#E5E5EA',
  primary: '#007AFF',
  accent: '#5856D6',
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
  text: '#1C1C1E',
  textDim: '#8E8E93',
  surface: '#F9F9FB',
  tabBarBg: 'rgba(255,255,255,0.7)',
  tabBarBorder: 'rgba(229,229,234,0.8)',
  blurTint: 'light' as const,
};

const DARK_THEME = {
  scheme: 'dark' as const,
  bg: '#0B0D10',
  card: '#14171C',
  cardBorder: '#232834',
  primary: '#0A84FF',
  accent: '#BF5AF2',
  success: '#32D74B',
  warning: '#FF9F0A',
  danger: '#FF453A',
  text: '#F2F2F7',
  textDim: '#8E8E93',
  surface: '#1C1F26',
  tabBarBg: 'rgba(20,23,28,0.72)',
  tabBarBorder: 'rgba(44,48,58,0.9)',
  blurTint: 'dark' as const,
};

const ThemeContext = React.createContext({
  theme: LIGHT_THEME,
  statusBarStyle: 'dark' as 'light' | 'dark'
});
const StylesContext = React.createContext<ReturnType<typeof createStyles> | null>(null);

const useTheme = () => React.useContext(ThemeContext);
const useStyles = () => {
  const ctx = React.useContext(StylesContext);
  return ctx || createStyles(LIGHT_THEME);
};

// --- 3. API SERVICE ---

const getMockCar = (plate: string): Car => ({
  plate: plate.toUpperCase(),
  make: 'Volkswagen',
  model: 'Golf GTI',
  year: 2019,
  vin: 'WVWZZZ1K99...',
  nextEU: '2025-10-20',
  mileage: 85000,
  topSpeed: '250 km/h',
  engineLiters: '2.0 L',
  totalWeight: '1900 kg',
  seats: '4',
  fuelType: 'Bensin'
});

const fetchCarDetails = async (plate: string): Promise<Car> => {
  if (USE_MOCK_API) return new Promise(r => setTimeout(() => r(getMockCar(plate)), 1000));

  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');

  const url = `${apiBaseUrl.replace(/\/$/, '')}/car?plate=${encodeURIComponent(plate.replace(/\s/g, ''))}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Check server or network.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  const data = await response.json();
  const raw = data?.kjoretoydataListe?.[0];
  if (!raw) throw new Error("Car not found");

  // Deep Extract
  const tech = raw.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const gen = tech?.generelt;
  
  const topSpeed = tech?.motorOgDrivverk?.maksimumHastighet?.[0] || null;
  const displacement = tech?.motorOgDrivverk?.motor?.[0]?.slagvolum || null;
  const totalWeight = tech?.vekter?.tillattTotalvekt || null;
  const seatsTotal = tech?.persontall?.sitteplasserTotalt || null;
  const fuel =
    tech?.motorOgDrivverk?.motor?.[0]?.drivstoff?.[0]?.drivstoffKode?.kodeBeskrivelse ||
    tech?.miljodata?.miljoOgdrivstoffGruppe?.[0]?.drivstoffKodeMiljodata?.kodeBeskrivelse ||
    null;

  return {
    plate: raw.kjennemerke?.[0]?.kjennemerke || plate,
    make: gen?.merke?.[0]?.merke || 'Unknown',
    model: gen?.handelsbetegnelse?.[0] || 'Unknown',
    year: raw?.godkjenning?.forstegangsGodkjenning?.forstegangRegistrertDato
      ? new Date(raw.godkjenning.forstegangsGodkjenning.forstegangRegistrertDato).getFullYear()
      : raw.forstegangsregistrering?.registrertForstegangNorgeDato
        ? new Date(raw.forstegangsregistrering.registrertForstegangNorgeDato).getFullYear()
        : 2000,
    vin: raw.kjoretoyId?.understellsnummer || 'Unknown',
    nextEU: raw.periodiskKjoretoyKontroll?.kontrollfrist || 'N/A',
    mileage: raw?.godkjenning?.forstegangsGodkjenning?.bruktimport?.kilometerstand || 0,
    topSpeed: topSpeed ? `${topSpeed} km/h` : null,
    engineLiters: displacement ? `${(displacement / 1000).toFixed(1)} L` : null,
    totalWeight: totalWeight ? `${totalWeight} kg` : null,
    seats: seatsTotal ? String(seatsTotal) : null,
    fuelType: fuel
  };
};

// --- 4. MAIN APP ---

export default function App() {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const tabKeys = ['garage', 'logs', 'vault', 'config'] as const;
  const screenWidth = Dimensions.get('window').width;
  const addLogX = useRef(new Animated.Value(screenWidth)).current;
  const typesX = useRef(new Animated.Value(screenWidth)).current;
  const [view, setView] = useState<'onboarding' | 'garage' | 'vault' | 'logs' | 'config'>('onboarding');
  const [car, setCar] = useState<Car | null>(null);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [selectedLogType, setSelectedLogType] = useState<LogType>('service');
  const [logTypes, setLogTypes] = useState<LogType[]>([
    'service',
    'repair',
    'inspection',
    'upgrade',
    'fuel',
  ]);
  const [docs, setDocs] = useState<Doc[]>([
    { id: '1', title: 'Insurance Policy', expiry: '2025-01-01', type: 'insurance' },
    { id: '2', title: 'Vognkort (Del 2)', expiry: 'Never', type: 'vognkort' }
  ]);
  const [units, setUnits] = useState<'km' | 'mi'>('km');
  const [appTheme, setAppTheme] = useState<'system' | 'light' | 'dark'>('system');
  const colorScheme = useColorScheme();

  const resolvedTheme = appTheme === 'system' ? (colorScheme ?? 'light') : appTheme;
  const theme = useMemo(
    () => (resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME),
    [resolvedTheme]
  );
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusBarStyle: 'light' | 'dark' = resolvedTheme === 'dark' ? 'light' : 'dark';
  
  // Modals
  const [modals, setModals] = useState({ addLog: false, mileage: false, types: false });

  // --- ACTIONS ---
  useEffect(() => {
    if (!modals.addLog) return;
    addLogX.setValue(screenWidth);
    Animated.timing(addLogX, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [addLogX, modals.addLog, screenWidth]);

  useEffect(() => {
    if (!modals.types) return;
    typesX.setValue(screenWidth);
    Animated.timing(typesX, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [modals.types, screenWidth, typesX]);

  const openAddLog = () => setModals((prev) => ({ ...prev, addLog: true }));
  const closeAddLog = () => {
    Animated.timing(addLogX, {
      toValue: screenWidth,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setModals((prev) => ({ ...prev, addLog: false }));
      }
    });
  };

  const openTypes = () => setModals((prev) => ({ ...prev, types: true }));
  const closeTypes = () => {
    Animated.timing(typesX, {
      toValue: screenWidth,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setModals((prev) => ({ ...prev, types: false }));
      }
    });
  };

  const openMileageInput = () => {
    const currentValue =
      units === 'mi'
        ? Math.round((car?.mileage || 0) * 0.621371)
        : car?.mileage || 0;
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Update Odometer',
        '',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: (value) =>
              handleUpdateMileage(toKilometers(parseInt(String(value), 10) || 0, units))
          }
        ],
        'plain-text',
        currentValue.toString()
      );
      return;
    }

    setModals((prev) => ({ ...prev, mileage: true }));
  };

  const navigateTo = (nextView: 'garage' | 'vault' | 'logs' | 'config') => {
    setView(nextView);
    const nextIndex = tabKeys.indexOf(nextView);
    if (nextIndex >= 0) {
      pagerRef.current?.setPage(nextIndex);
    }
  };

  const handleRegister = async (plate: string) => {
    try {
      const data = await fetchCarDetails(plate);
      setCar(data);
      // Create initial log
      const initLog: ServiceLog = {
        id: Date.now().toString(),
        title: 'Car Added to Glovebox',
        date: new Date().toISOString().split('T')[0],
        mileage: 0,
        cost: 0,
        type: 'system',
        notes: 'Vehicle imported via Statens Vegvesen API.',
        isSystemEvent: true
      };
      setLogs([initLog]);
      setView('garage');
      pagerRef.current?.setPage(0);
    } catch (e) {
      Alert.alert("Failed", "Could not fetch car details.");
    }
  };

  const handleUpdateMileage = (newKm: number) => {
    if (!car) return;
    const oldKm = car.mileage;
    setCar({ ...car, mileage: newKm });
    
    // AUDIT LOG
    const auditLog: ServiceLog = {
      id: Date.now().toString(),
      title: 'Odometer Correction',
      date: new Date().toISOString().split('T')[0],
      mileage: newKm,
      cost: 0,
      type: 'system',
      notes: `Manual update: ${oldKm}km -> ${newKm}km`,
      isSystemEvent: true
    };
    setLogs([auditLog, ...logs]);
    setModals({ ...modals, mileage: false });
  };

  const handleAddLog = (log: ServiceLog) => {
    // If mileage increased in log, update car
    if (car && log.mileage > car.mileage) {
      handleUpdateMileage(log.mileage); // This triggers the audit log too!
    }
    setLogs([log, ...logs]);
  };

  const deleteCar = () => {
    Alert.alert("Nuclear Option", "Delete this car and all history?", [
      { text: "Cancel", style: 'cancel' },
      { text: "Delete", style: 'destructive', onPress: () => { setCar(null); setLogs([]); setView('onboarding'); } }
    ]);
  };

  // --- RENDER ---

  return (
    <ThemeContext.Provider value={{ theme, statusBarStyle }}>
      <StylesContext.Provider value={styles}>
        {view === 'onboarding' ? (
          <Onboarding onRegister={handleRegister} />
        ) : (
          <View style={styles.container}>
            <StatusBar style={statusBarStyle} />

            {/* Dynamic Header Area (Part of ScrollView in sub-screens, or Fixed) */}
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
              <PagerView
                ref={pagerRef}
                style={{ flex: 1 }}
                initialPage={0}
                onPageSelected={(event) => {
                  const nextView = tabKeys[event.nativeEvent.position];
                  if (nextView) setView(nextView);
                }}>
                <View key="garage" style={{ flex: 1, backgroundColor: theme.bg }}>
                  <GarageScreen 
                    car={car!} 
                    logs={logs} 
                    onOpenLog={openAddLog}
                    onOpenMileage={openMileageInput}
                    onViewAllLogs={() => navigateTo('logs')}
                    units={units}
                  />
                </View>
                <View key="logs" style={{ flex: 1, backgroundColor: theme.bg }}>
                  <TimelineScreen
                    logs={logs}
                    onOpenLog={() => setModals({ ...modals, addLog: true })}
                    themeKey={resolvedTheme}
                    units={units}
                  />
                </View>
                <View key="vault" style={{ flex: 1, backgroundColor: theme.bg }}>
                  <VaultScreen docs={docs} themeKey={resolvedTheme} />
                </View>
                <View key="config" style={{ flex: 1, backgroundColor: theme.bg }}>
                  <ConfigScreen
                    car={car!}
                    onDelete={deleteCar}
                    onChangeCar={() => setView('onboarding')}
                    units={units}
                    appTheme={appTheme}
                    onChangeUnits={setUnits}
                    onChangeAppTheme={setAppTheme}
                  />
                </View>
              </PagerView>

              {/* --- CUSTOM TAB BAR (Perfectly Centered FAB) --- */}
              <View style={[styles.tabBarContainer, { height: 49 + insets.bottom }]}>
                <BlurView intensity={50} tint={theme.blurTint} style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
                  <View style={styles.tabBarContent}>
                    <TabBtn icon="car-sport" label="Garage" active={view === 'garage'} onPress={() => navigateTo('garage')} />
                    <TabBtn icon="document-text" label="Logs" active={view === 'logs'} onPress={() => navigateTo('logs')} />
                    <TabBtn icon="file-tray-full" label="Vault" active={view === 'vault'} onPress={() => navigateTo('vault')} />
                    <TabBtn icon="settings" label="Config" active={view === 'config'} onPress={() => navigateTo('config')} />
                  </View>
                </BlurView>

              </View>

              {/* --- MODALS --- */}
              {modals.addLog && (
                <Animated.View style={[styles.addLogOverlay, { transform: [{ translateX: addLogX }] }]}>
                  <AddLogModal
                    onClose={closeAddLog}
              onSave={(log: ServiceLog) => { handleAddLog(log); closeAddLog(); setSelectedLogType('service'); }}
              mileagePlaceholder={car ? formatDistance(car.mileage, units).replace(/\\s?(km|mi)$/, '') : 'Auto'}
              logTypes={logTypes}
              logType={selectedLogType}
              onManageTypes={openTypes}
              units={units}
            />
          </Animated.View>
        )}
              {modals.types && (
                <Animated.View style={[styles.addLogOverlay, { transform: [{ translateX: typesX }] }]}>
                  <TypesPage
                    types={logTypes}
                    selectedType={logTypes.includes(selectedLogType) ? selectedLogType : logTypes[0]}
                    onSelectType={(value: string) => {
                      setSelectedLogType(value);
                      closeTypes();
                    }}
                    onClose={closeTypes}
                    onAddType={(value: string) => {
                      const clean = value.trim();
                      if (!clean) return;
                      setLogTypes((prev) => {
                        if (prev.includes(clean)) return prev;
                        return [...prev, clean];
                      });
                    }}
                    onRemoveType={(value: string) =>
                      setLogTypes((prev) => {
                        const next = prev.filter((type) => type !== value);
                        if (value === selectedLogType) {
                          setSelectedLogType(next[0] || 'service');
                        }
                        return next.length ? next : ['service'];
                      })
                    }
                  />
                </Animated.View>
              )}
              <SimpleInputModal
                visible={modals.mileage}
                title="Update Odometer"
          placeholder={
            car
              ? formatDistance(car.mileage, units).replace(/\\s?(km|mi)$/, '')
              : undefined
          }
          keyboard="numeric"
          onClose={() => setModals({...modals, mileage: false})}
          onSave={(val) => handleUpdateMileage(toKilometers(parseInt(val) || 0, units))}
          units={units}
        />
            </SafeAreaView>
          </View>
        )}
      </StylesContext.Provider>
    </ThemeContext.Provider>
  );
}

// --- SCREENS ---

const GarageScreen = ({ car, logs, onOpenLog, onOpenMileage, onViewAllLogs, units }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const daysToEu = Math.ceil((new Date(car.nextEU).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
  const euStatus = daysToEu < 30 ? 'danger' : daysToEu < 120 ? 'warning' : 'success';
  const lastExpense = logs.find((log: ServiceLog) => log.cost > 0)?.cost || 0;
  const plateDisplay = String(car.plate || '').replace(/\s+/g, '');
  const BrandLogo = getBrandLogo(car.make);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
    >
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>Glovebox</Text>
        </View>
        <TouchableOpacity style={styles.headerPill} onPress={onOpenLog}>
          <Ionicons name="add" size={16} color="white" />
          <Text style={styles.headerPillText}>Quick log</Text>
        </TouchableOpacity>
      </View>

      {/* Hero Card */}
      <View style={styles.heroContainer}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroBrand}>{car.make}</Text>
          {BrandLogo ? (
            <View style={styles.brandLogoWrap}>
              <BrandLogo width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
            </View>
          ) : (
            <Text style={styles.heroLogo}>LOGO</Text>
          )}
        </View>
        <Text style={styles.heroModel}>{car.model}</Text>
        <View style={styles.heroBottomRow}>
          <Text style={styles.heroLinePlate}>{car.year}</Text>
          <Text style={styles.heroLinePlate}>{plateDisplay}</Text>
        </View>

      </View>

      {/* Health Tiles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>STATUS</Text>
        <View style={styles.tileGrid}>
          <InfoTile
            label="Odometer"
            value={formatDistance(car.mileage, units)}
            sub="Tap to update"
            tone={theme.primary}
            icon="speedometer"
            onPress={onOpenMileage}
          />
          <InfoTile
            label="EU Control"
            value={daysToEu < 0 ? 'Overdue' : `${daysToEu} days`}
            sub={car.nextEU}
            tone={theme[euStatus]}
            icon="calendar"
          />
          <InfoTile
            label="Total Cost"
            value={`${logs.reduce((a:any,b:any)=>a+b.cost,0)} kr`}
            sub="Lifetime"
            tone={theme.accent}
            icon="wallet"
          />
          <InfoTile
            label="Last Expense"
            value={`${lastExpense} kr`}
            sub="Most recent"
            tone={theme.success}
            icon="cash"
          />
        </View>
      </View>

      {/* Recent History */}
      <View style={styles.section}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
          <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
          <TouchableOpacity onPress={onViewAllLogs}><Text style={{color: theme.primary, fontWeight: '600'}}>View All</Text></TouchableOpacity>
        </View>
        {logs.slice(0,3).map((l: ServiceLog) => <LogRow key={l.id} log={l} units={units} />)}
      </View>

    </ScrollView>
  );
};

const VaultScreen = ({ docs, themeKey }: { docs: Doc[]; themeKey: string }) => {
  const { theme } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.screenContainer}>
    <View style={styles.pageHeaderRow}>
      <View>
        <Text style={styles.pageTitle}>Vault</Text>
        <Text style={styles.pageSub}>Keep documents safe and ready.</Text>
      </View>
      <TouchableOpacity
        style={styles.headerIconBtn}
        onPress={() => Alert.alert("Demo", "Camera scanner would open here.")}>
        <Ionicons name="scan" size={20} color="white" />
      </TouchableOpacity>
    </View>
    
    <FlatList
      style={{ backgroundColor: theme.bg }}
      data={docs}
      extraData={themeKey}
      keyExtractor={d => d.id}
      renderItem={({item}) => (
        <TouchableOpacity style={styles.docRow}>
          <View style={[styles.docIcon, { backgroundColor: item.type === 'insurance' ? theme.success : theme.accent }]}>
            <Ionicons name="document-text" size={22} color="white" />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.docTitle}>{item.title}</Text>
            <Text style={styles.docSub}>Expires: {item.expiry}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textDim} />
        </TouchableOpacity>
      )}
    />
  </View>
  );
};

const TimelineScreen = ({ logs, onOpenLog, themeKey, units }: { logs: ServiceLog[]; onOpenLog: () => void; themeKey: string; units: 'km' | 'mi' }) => {
  const { theme } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.screenContainer}>
    <View style={styles.pageHeaderRow}>
      <View>
        <Text style={styles.pageTitle}>Service Log</Text>
        <Text style={styles.pageSub}>Track maintenance and expenses.</Text>
      </View>
      <TouchableOpacity style={styles.headerIconBtn} onPress={onOpenLog}>
        <Ionicons name="add" size={20} color="white" />
      </TouchableOpacity>
    </View>
    <FlatList
      style={{ backgroundColor: theme.bg }}
      data={logs}
      extraData={themeKey}
      keyExtractor={l => l.id}
      contentContainerStyle={{paddingBottom: 100}}
      renderItem={({item}) => <LogRow log={item} units={units} />}
    />
  </View>
  );
};

const ConfigScreen = ({ car, onDelete, onChangeCar, units, appTheme, onChangeUnits, onChangeAppTheme }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.screenContainer}>
    <Text style={styles.pageTitle}>Settings</Text>
    
    <Text style={styles.settingsHeader}>VEHICLE</Text>
    <View style={styles.settingsGroup}>
      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>Plate Number</Text>
        <Text style={styles.settingsValue}>{car.plate}</Text>
      </View>
      <View style={styles.settingsDivider} />
      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>VIN</Text>
        <Text style={styles.settingsValue}>{car.vin}</Text>
      </View>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsRow} onPress={onChangeCar}>
        <Text style={styles.settingsLabel}>Change Car</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
      </TouchableOpacity>
    </View>

    <Text style={styles.settingsHeader}>Units</Text>
    <View style={styles.settingsGroup}>
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeUnits('km')}>
        <Text style={styles.settingsChoiceLabel}>Kilometers</Text>
        {units === 'km' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeUnits('mi')}>
        <Text style={styles.settingsChoiceLabel}>Miles</Text>
        {units === 'mi' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
    </View>

    <Text style={styles.settingsHeader}>App Theme</Text>
    <View style={styles.settingsGroup}>
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeAppTheme('system')}>
        <Text style={styles.settingsChoiceLabel}>System</Text>
        {appTheme === 'system' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeAppTheme('light')}>
        <Text style={styles.settingsChoiceLabel}>Light</Text>
        {appTheme === 'light' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeAppTheme('dark')}>
        <Text style={styles.settingsChoiceLabel}>Dark</Text>
        {appTheme === 'dark' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
    </View>

    <View style={styles.settingsGroup}>
      <TouchableOpacity style={styles.settingsRow} onPress={onDelete}>
        <Text style={styles.settingsDestructive}>Delete Vehicle</Text>
      </TouchableOpacity>
    </View>
  </View>
  );
};

// --- COMPONENTS ---

const SpecBox = ({ label, value, icon }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.specBox}>
      <Ionicons name={icon} size={18} color={theme.primary} style={{marginBottom: 8}} />
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={[styles.specValue, !value && {color: theme.danger}]}>
        {value || 'Unknown'}
      </Text>
    </View>
  );
};

const AlertCard = ({ color, icon, title, value, sub }: any) => {
  const styles = useStyles();
  return (
    <View style={[styles.alertCard, { borderTopColor: color }]}>
      <Ionicons name={icon} size={24} color={color} style={{marginBottom: 8}} />
      <Text style={styles.alertTitle}>{title}</Text>
      <Text style={[styles.alertValue, { color }]}>{value}</Text>
      <Text style={styles.alertSub}>{sub}</Text>
    </View>
  );
};

const InfoTile = ({ label, value, sub, tone, icon, onPress }: any) => {
  const styles = useStyles();
  return (
    <TouchableOpacity style={styles.infoTile} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.infoTileHeader}>
        <Ionicons name={icon} size={18} color={tone} />
        <Text style={styles.infoTileLabel}>{label}</Text>
      </View>
      <Text style={styles.infoTileValue}>{value}</Text>
      <Text style={styles.infoTileSub}>{sub}</Text>
    </TouchableOpacity>
  );
};

const LogRow = ({ log, units }: { log: ServiceLog; units: 'km' | 'mi' }) => {
  const { theme } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.logRow}>
      <View style={styles.logTimelineLine} />
      <View style={[styles.logIconParams, { borderColor: log.isSystemEvent ? theme.textDim : theme.primary }]}>
        <Ionicons 
          name={log.isSystemEvent ? "settings" : getTypeIconName(log.type)} 
          size={14} 
          color={log.isSystemEvent ? theme.textDim : theme.primary} 
        />
      </View>
      <View style={styles.logContent}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Text style={styles.logTitle}>{log.title}</Text>
          <Text style={styles.logDate}>{log.date}</Text>
        </View>
        {!!log.notes && <Text style={styles.logNotes}>{log.notes}</Text>}
        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 4}}>
          <Text style={styles.logMeta}>{log.mileage > 0 ? formatDistance(log.mileage, units) : ''}</Text>
          {log.cost > 0 && <Text style={styles.logCost}>{log.cost} kr</Text>}
        </View>
      </View>
    </View>
  );
};

const TabBtn = ({ icon, label, active, onPress }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity style={styles.tabBtn} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={active ? icon : `${icon}-outline`} size={22} color={active ? theme.primary : theme.textDim} />
      <Text style={[styles.tabLabel, { color: active ? theme.primary : theme.textDim }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const getTypeIconName = (type: string) => {
  const key = String(type || '').toLowerCase();
  if (key === 'service') return 'build';
  if (key === 'repair') return 'construct';
  if (key === 'inspection') return 'search';
  if (key === 'upgrade') return 'rocket';
  if (key === 'fuel') return 'water';
  return 'pricetag';
};

// --- MODALS ---

const AddLogModal = ({ onClose, onSave, mileagePlaceholder, logTypes, logType, onManageTypes, units }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');
  const [logDate, setLogDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const formatLogDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const typeLabel = (value: LogType) =>
    String(value || '').replace(/^\w/, (char) => char.toUpperCase()) || 'Service';
  const availableTypes: LogType[] = logTypes?.length ? logTypes : ['service'];

  return (
    <View style={[styles.modalBase, { backgroundColor: theme.bg }]}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.modalCancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.modalH1}>New Log</Text>
        <TouchableOpacity
            onPress={() => {
              onSave({
                id: Date.now().toString(),
                title: title || typeLabel(logType),
                cost: parseInt(cost) || 0,
                mileage: toKilometers(parseInt(mileage) || 0, units),
                date: logDate.toISOString().split('T')[0],
                type: logType,
                notes,
                isSystemEvent: false
              });
              setTitle('');
              setCost('');
              setNotes('');
              setLogDate(new Date());
            }}>
          <Text style={styles.modalSaveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.logForm}>
        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Details</Text>
          <View style={styles.listGroup}>
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Title</Text>
              <TextInput
                style={styles.listInput}
                placeholderTextColor={theme.textDim}
                placeholder="Oil Change"
                value={title}
                onChangeText={setTitle}
              />
            </View>
            <View style={styles.listDivider} />
            <TouchableOpacity
              style={styles.listRow}
              onPress={() => setShowDatePicker(!showDatePicker)}>
              <Text style={styles.listLabel}>Date</Text>
              <View style={styles.listValueRow}>
                <Text style={styles.listValue}>{formatLogDate(logDate)}</Text>
              </View>
            </TouchableOpacity>
            {showDatePicker && (
              <View style={styles.datePickerRow}>
                <DateTimePicker
                  value={logDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant={theme.scheme === 'dark' ? 'dark' : 'light'}
                  onChange={(event, selectedDate) => {
                    if (Platform.OS !== 'ios') {
                      setShowDatePicker(false);
                    }
                    if (selectedDate) {
                      setLogDate(selectedDate);
                    }
                  }}
                />
              </View>
            )}
            <View style={styles.listDivider} />
            <TouchableOpacity style={styles.listRow} onPress={onManageTypes}>
              <Text style={styles.listLabel}>Type</Text>
              <View style={styles.listValueRow}>
                <Text style={styles.listValue}>
                  {String(logType || availableTypes[0]).charAt(0).toUpperCase() + String(logType || availableTypes[0]).slice(1)}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Numbers</Text>
          <View style={styles.listGroup}>
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Cost</Text>
              <TextInput
                style={styles.listInput}
                placeholderTextColor={theme.textDim}
                placeholder="0"
                keyboardType="numeric"
                value={cost}
                onChangeText={setCost}
              />
            </View>
            <View style={styles.listDivider} />
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Mileage</Text>
              <TextInput
                style={styles.listInput}
                placeholderTextColor={theme.textDim}
                placeholder={mileagePlaceholder}
                keyboardType="numeric"
                value={mileage}
                onChangeText={setMileage}
              />
            </View>
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Notes</Text>
          <View style={styles.listGroup}>
            <TextInput
              style={styles.notesInput}
              placeholderTextColor={theme.textDim}
              placeholder="Details..."
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const SimpleInputModal = ({ visible, title, placeholder, keyboard, onClose, onSave, units }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const [val, setVal] = useState('');
  useEffect(() => setVal(''), [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalPopup}>
          <Text style={styles.popupTitle}>{title}</Text>
          <TextInput 
            style={styles.input} 
            placeholder={placeholder} 
            placeholderTextColor={theme.textDim}
            value={val} 
            onChangeText={setVal} 
            keyboardType={keyboard}
            autoFocus
          />
          {units && <Text style={styles.popupHelp}>Unit: {units.toUpperCase()}</Text>}
          <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
            <TouchableOpacity onPress={onClose} style={[styles.popupBtn, {backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.cardBorder}]}><Text style={{color: theme.text}}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => onSave(val)} style={[styles.popupBtn, {backgroundColor: theme.primary}]}><Text style={{fontWeight: '600', color: 'white'}}>Save</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const TypesPage = ({ types, selectedType, onSelectType, onAddType, onRemoveType, onClose }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const promptAddType = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt('New Type', 'Name your type', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: (value) => onAddType(String(value || ''))
        }
      ]);
      return;
    }

    Alert.alert('New Type', 'Enter the type name:', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add',
        onPress: () => {}
      }
    ]);
  };

  return (
    <View style={[styles.modalBase, { backgroundColor: theme.bg }]}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.modalCancelText}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.modalH1}>Manage Types</Text>
        <TouchableOpacity style={styles.headerIconBtn} onPress={promptAddType}>
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.logForm}>
        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Your Types</Text>
          <View style={styles.listGroup}>
            {types.map((type: string, index: number) => (
              <View key={type}>
                <Swipeable
                  renderRightActions={() => (
                    <TouchableOpacity style={styles.swipeDelete} onPress={() => onRemoveType(type)}>
                      <Ionicons name="trash" size={18} color="white" />
                    </TouchableOpacity>
                  )}>
                  <View style={styles.listRow}>
                    <TouchableOpacity style={styles.typeSelectBtn} onPress={() => onSelectType(type)}>
                      <View style={styles.typeNameRow}>
                        <Ionicons name={getTypeIconName(type)} size={16} color={theme.textDim} />
                        <Text style={styles.typeName}>{String(type).charAt(0).toUpperCase() + String(type).slice(1)}</Text>
                      </View>
                      {selectedType === type && (
                        <Ionicons name="checkmark" size={18} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </Swipeable>
                {index < types.length - 1 && <View style={styles.listDivider} />}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const Onboarding = ({ onRegister }: any) => {
  const { theme, statusBarStyle } = useTheme();
  const styles = useStyles();
  const [plate, setPlate] = useState('');
  const [load, setLoad] = useState(false);
  return (
    <SafeAreaView style={[styles.container, {justifyContent: 'center', alignItems: 'center'}]}>
      <StatusBar style={statusBarStyle} />
      <Ionicons name="car-sport" size={80} color={theme.primary} style={{marginBottom: 20}} />
      <Text style={{fontSize: 32, fontWeight: '700', color: theme.text}}>Glovebox</Text>
      <Text style={{color: theme.textDim, marginBottom: 40}}>Ready in seconds.</Text>
      <TextInput 
        style={[styles.input, {width: '80%', textAlign: 'center', fontSize: 24}]} 
        placeholder="LICENSE PLATE" 
        placeholderTextColor={theme.textDim}
        value={plate}
        onChangeText={setPlate}
        autoCapitalize="characters"
      />
      <TouchableOpacity 
        style={[styles.mainBtn, {width: '80%', marginTop: 20}]} 
        onPress={() => { setLoad(true); onRegister(plate).finally(() => setLoad(false)); }}
      >
        {load ? <ActivityIndicator color="white" /> : <Text style={styles.btnTxt}>Start</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
};

// --- STYLES ---

const createStyles = (theme: typeof LIGHT_THEME) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  screenContainer: { flex: 1, padding: 20, backgroundColor: theme.bg },
  
  // Hero
  heroContainer: { backgroundColor: theme.card, margin: 16, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.cardBorder, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  heroLogo: { fontSize: 16, color: theme.primary, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  brandLogoWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { color: theme.text, fontSize: 28, fontWeight: '700' },
  headerPill: { backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerPillText: { color: 'white', fontWeight: '600', fontSize: 12 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  heroBrand: { color: theme.primary, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 16 },
  heroModel: { fontSize: 24, fontWeight: '700', color: theme.text, marginTop: -2 },
  heroLinePlate: { color: theme.textDim, fontWeight: '600', fontSize: 15, letterSpacing: 0.4 },
  heroStatus: { color: theme.textDim, fontSize: 12, marginTop: 6 },
  heroChangeText: { color: theme.primary, fontWeight: '600', fontSize: 13 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  heroMeta: { color: theme.textDim, fontSize: 12, fontWeight: '600' },
  heroMetaDot: { color: theme.textDim, paddingHorizontal: 6 },
  mileageRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder },
  mileageLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mileageText: { color: theme.text, fontWeight: '600', fontSize: 14 },

  // Sections
  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionTitle: { color: theme.textDim, fontSize: 12, fontWeight: '700', marginBottom: 12, letterSpacing: 0.4 },
  
  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  specBox: { width: '31%', backgroundColor: theme.card, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.cardBorder, minHeight: 90 },
  specLabel: { color: theme.textDim, fontSize: 11, marginTop: 'auto' },
  specValue: { color: theme.text, fontWeight: '600', fontSize: 13, marginTop: 2 },

  // Tiles
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  infoTile: { width: '48%', backgroundColor: theme.card, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.cardBorder },
  infoTileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  infoTileLabel: { color: theme.textDim, fontSize: 11, fontWeight: '700' },
  infoTileValue: { color: theme.text, fontSize: 18, fontWeight: '700' },
  infoTileSub: { color: theme.textDim, fontSize: 10, marginTop: 4 },

  // Alerts
  alertCard: { width: 140, backgroundColor: theme.card, marginRight: 12, padding: 16, borderRadius: 16, borderTopWidth: 4 },
  alertTitle: { color: theme.text, fontWeight: '600', fontSize: 14 },
  alertValue: { fontSize: 18, fontWeight: '700', marginVertical: 4 },
  alertSub: { color: theme.textDim, fontSize: 10 },

  // Logs
  logRow: { flexDirection: 'row', marginBottom: 20 },
  logTimelineLine: { width: 2, backgroundColor: theme.cardBorder, position: 'absolute', left: 15, top: 0, bottom: -20 },
  logIconParams: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.bg, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  logContent: { flex: 1, marginLeft: 12, backgroundColor: theme.card, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder },
  logTitle: { color: theme.text, fontWeight: '600' },
  logDate: { color: theme.textDim, fontSize: 10 },
  logNotes: { color: theme.textDim, fontSize: 12, marginVertical: 4 },
  logMeta: { color: theme.primary, fontSize: 10, fontWeight: '600' },
  logCost: { color: theme.danger, fontSize: 12, fontWeight: '600' },

  // Tab Bar
  tabBarContainer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tabBar: { flex: 1, backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderColor: theme.tabBarBorder },
  tabBarContent: { height: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 12, paddingTop: 6 },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  tabLabel: { fontSize: 10, fontWeight: '500', marginTop: 2 },

  // Forms
  input: { backgroundColor: theme.card, color: theme.text, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: theme.cardBorder },
  inpLabel: { color: theme.textDim, fontSize: 11, fontWeight: '600', marginBottom: 8 },
  mainBtn: { backgroundColor: theme.primary, padding: 16, borderRadius: 14, alignItems: 'center' },
  btnTxt: { fontWeight: '600', color: 'white' },
  
  // Vault
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.cardBorder },
  docIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  docTitle: { color: theme.text, fontWeight: '600', fontSize: 16 },
  docSub: { color: theme.textDim, fontSize: 12 },
  dashedBtn: { borderWidth: 1, borderColor: theme.cardBorder, borderStyle: 'dashed', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 10 },

  // Config
  pageTitle: { fontSize: 28, fontWeight: '700', color: theme.text, marginBottom: 4 },
  pageSub: { color: theme.textDim, marginBottom: 0 },
  pageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  settingsHeader: { color: theme.textDim, fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 8, paddingHorizontal: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  settingsGroup: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder, overflow: 'hidden', marginBottom: 12 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  settingsDivider: { height: 1, backgroundColor: theme.cardBorder },
  settingsLabel: { color: theme.text, fontSize: 16 },
  settingsValue: { color: theme.textDim, fontSize: 16 },
  settingsDestructive: { color: theme.danger, fontSize: 16, fontWeight: '600' },
  settingsChoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  settingsChoiceLabel: { color: theme.text, fontSize: 16 },

  // Modals
  modalBase: { flex: 1, paddingTop: 60 },
  modalHeader: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalH1: { fontSize: 20, fontWeight: '700', color: theme.text },
  modalSaveText: { color: theme.primary, fontWeight: '600', fontSize: 16 },
  modalCancelText: { color: theme.primary, fontWeight: '600', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 40 },
  modalPopup: { backgroundColor: theme.card, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: theme.cardBorder },
  popupTitle: { color: theme.text, fontSize: 18, fontWeight: '600', marginBottom: 16 },
  popupHelp: { color: theme.textDim, fontSize: 12, marginTop: 6 },
  popupBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  addLogOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.bg, zIndex: 20 },
  logForm: { padding: 20, paddingBottom: 40 },
  formSection: { marginBottom: 18 },
  sectionHeader: { color: theme.textDim, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  listGroup: { backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 16 },
  listLabel: { color: theme.text, fontSize: 15, fontWeight: '500', width: 80 },
  listValue: { color: theme.text, fontSize: 16, textAlign: 'right' },
  listValueRow: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  listInput: { flex: 1, textAlign: 'right', color: theme.text, fontSize: 16 },
  typeRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  typePill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.surface },
  typePillActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  typePillText: { color: theme.textDim, fontSize: 12, fontWeight: '600' },
  typePillTextActive: { color: 'white' },
  typeSelectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 },
  typeNameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeName: { color: theme.text, fontSize: 15, fontWeight: '500' },
  swipeDelete: { width: 64, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' },
  listDivider: { height: 1, backgroundColor: theme.cardBorder },
  notesInput: { minHeight: 120, paddingHorizontal: 14, paddingVertical: 12, color: theme.text, fontSize: 15, textAlignVertical: 'top' },
  datePickerRow: { paddingHorizontal: 12, paddingBottom: 8, backgroundColor: theme.card },
  formFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: theme.cardBorder, flexDirection: 'row', gap: 12 }
});
