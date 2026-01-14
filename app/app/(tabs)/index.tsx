import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActionSheetIOS,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
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
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Swipeable } from 'react-native-gesture-handler';
import { getBrandLogo } from '../../brand-logos';
import * as SQLite from 'expo-sqlite';

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
  projectId?: string | null;
  isSystemEvent: boolean; // If true, user cannot delete easily
}

interface Doc {
  id: string;
  title: string;
  expiry: string;
  type: 'license' | 'insurance' | 'vognkort';
}

interface Project {
  id: string;
  title: string;
  status: 'planned' | 'active' | 'done';
  updatedAt: number;
  carId: number;
  description?: string | null;
  category?: string | null;
  budgetPlanned?: number | null;
}

interface ProjectMedia {
  id: string;
  projectId: string;
  uri: string;
  type: 'image';
  carId: number;
}

interface LogMedia {
  id: string;
  logId: string;
  uri: string;
  type: 'image';
  carId: number;
}

interface Car {
  id: number;
  plate: string;
  make: string;
  model: string;
  nickname?: string | null;
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

const DEFAULT_DOCS: Doc[] = [
  { id: '1', title: 'Insurance Policy', expiry: '2025-01-01', type: 'insurance' },
  { id: '2', title: 'Vognkort (Del 2)', expiry: 'Never', type: 'vognkort' }
];

const formatDistance = (km: number | undefined | null, units: 'km' | 'mi') => {
  if (km === undefined || km === null || Number.isNaN(km)) {
    return units === 'mi' ? '0 mi' : '0 km';
  }
  if (units === 'mi') {
    const miles = km * 0.621371;
    return `${miles.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi`;
  }
  return `${km.toLocaleString()} km`;
};

const toKilometers = (value: number, units: 'km' | 'mi') =>
  units === 'mi' ? Math.round(value / 0.621371) : Math.round(value);

const openDbAsync = () => SQLite.openDatabaseAsync('glovebox.db');

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
  id: Date.now(),
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
    id: Date.now(),
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
  const dbRef = useRef<any>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const settingsProjectIdRef = useRef<string | null>(null);
  const tabKeys = ['garage', 'logs', 'vault', 'config'] as const;
  const screenWidth = Dimensions.get('window').width;
  const appX = useRef(new Animated.Value(screenWidth)).current;
  const onboardingX = useRef(new Animated.Value(0)).current;
  const prevViewRef = useRef<'onboarding' | 'garage' | 'vault' | 'logs' | 'config'>('onboarding');
  const addLogX = useRef(new Animated.Value(screenWidth)).current;
  const typesX = useRef(new Animated.Value(screenWidth)).current;
  const projectDetailX = useRef(new Animated.Value(screenWidth)).current;
  const [view, setView] = useState<'onboarding' | 'garage' | 'vault' | 'logs' | 'config'>('onboarding');
  const [cars, setCars] = useState<Car[]>([]);
  const [car, setCar] = useState<Car | null>(null);
  const [activeCarId, setActiveCarId] = useState<number | null>(null);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [selectedLogType, setSelectedLogType] = useState<LogType>('service');
  const [logTypes, setLogTypes] = useState<LogType[]>([
    'service',
    'repair',
    'inspection',
    'upgrade',
    'fuel',
  ]);
  const [docs, setDocs] = useState<Doc[]>(DEFAULT_DOCS);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [projectMedia, setProjectMedia] = useState<ProjectMedia[]>([]);
  const [logMedia, setLogMedia] = useState<LogMedia[]>([]);
  const [units, setUnits] = useState<'km' | 'mi'>('km');
  const [appTheme, setAppTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [dbReady, setDbReady] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);

  const enqueueWrite = (task: () => Promise<void>) => {
    writeQueueRef.current = writeQueueRef.current
      .then(task)
      .catch((error: any) => {
        console.warn('Failed to write to local DB', error);
      });
    return writeQueueRef.current;
  };
  const colorScheme = useColorScheme();

  const resolvedTheme = appTheme === 'system' ? (colorScheme ?? 'light') : appTheme;
  const theme = useMemo(
    () => (resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME),
    [resolvedTheme]
  );
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusBarStyle: 'light' | 'dark' = resolvedTheme === 'dark' ? 'light' : 'dark';

  // Modals
  const [modals, setModals] = useState({
    addLog: false,
    mileage: false,
    types: false,
    projects: false,
    projectForm: false,
    projectDetail: false,
    nickname: false,
  });
  const [editingLog, setEditingLog] = useState<ServiceLog | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectDetailId, setProjectDetailId] = useState<string | null>(null);
  const [projectMediaViewer, setProjectMediaViewer] = useState<{ projectId: string; media: { id: string; uri: string }[]; index: number } | null>(null);
  const [logMediaViewer, setLogMediaViewer] = useState<{ logId: string | null; index: number }>({ logId: null, index: 0 });
  const [logMediaGrid, setLogMediaGrid] = useState<{ logId: string | null }>({ logId: null });
  const [projectImageGrid, setProjectImageGrid] = useState<{ projectId: string | null }>({ projectId: null });
  const [projectGridReturn, setProjectGridReturn] = useState<string | null>(null);
  const [logGridReturn, setLogGridReturn] = useState<string | null>(null);
  const [logFormSeed, setLogFormSeed] = useState<number>(0);

  // --- ACTIONS ---
  useEffect(() => {
    const prevView = prevViewRef.current;
    prevViewRef.current = view;
    if (view === 'onboarding') {
      if (prevView !== 'onboarding') {
        onboardingX.setValue(-screenWidth);
        Animated.parallel([
          Animated.timing(appX, {
            toValue: screenWidth,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(onboardingX, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          })
        ]).start();
      } else {
        appX.setValue(screenWidth);
        onboardingX.setValue(0);
      }
      return;
    }
    if (prevView === 'onboarding') {
      appX.setValue(screenWidth);
      onboardingX.setValue(0);
      Animated.parallel([
        Animated.timing(appX, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(onboardingX, {
          toValue: -screenWidth,
          duration: 280,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      appX.setValue(0);
      onboardingX.setValue(-screenWidth);
    }
  }, [appX, onboardingX, screenWidth, view]);
  useEffect(() => {
    const initDb = async () => {
      try {
        const db = await openDbAsync();
        dbRef.current = db;

        await db.execAsync(`CREATE TABLE IF NOT EXISTS car (
            id INTEGER PRIMARY KEY NOT NULL,
            plate TEXT,
            make TEXT,
            model TEXT,
            nickname TEXT,
            year INTEGER,
            vin TEXT,
            nextEU TEXT,
            mileage INTEGER,
            topSpeed TEXT,
            engineLiters TEXT,
            totalWeight TEXT,
            seats TEXT,
            fuelType TEXT
          );
          CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT,
            date TEXT,
            mileage INTEGER,
            cost INTEGER,
            type TEXT,
            notes TEXT,
            isSystemEvent INTEGER,
            projectId TEXT,
            carId INTEGER
          );
          CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT,
            status TEXT,
            updatedAt INTEGER,
            description TEXT,
            category TEXT,
            budgetPlanned REAL,
            carId INTEGER
          );
          CREATE TABLE IF NOT EXISTS project_media (
            id TEXT PRIMARY KEY NOT NULL,
            projectId TEXT,
            uri TEXT,
            type TEXT,
            carId INTEGER
          );
          CREATE TABLE IF NOT EXISTS log_media (
            id TEXT PRIMARY KEY NOT NULL,
            logId TEXT,
            uri TEXT,
            type TEXT,
            carId INTEGER
          );
          CREATE TABLE IF NOT EXISTS types (
            name TEXT PRIMARY KEY NOT NULL
          );
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT
          );
          CREATE TABLE IF NOT EXISTS docs (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT,
            expiry TEXT,
            type TEXT,
            carId INTEGER
          );`);

        const logColumns = await db.getAllAsync<any>('PRAGMA table_info(logs)');
        if (!logColumns.some((col: any) => col.name === 'carId')) {
          await db.execAsync('ALTER TABLE logs ADD COLUMN carId INTEGER');
        }
        if (!logColumns.some((col: any) => col.name === 'projectId')) {
          await db.execAsync('ALTER TABLE logs ADD COLUMN projectId TEXT');
        }
        const carColumns = await db.getAllAsync<any>('PRAGMA table_info(car)');
        if (!carColumns.some((col: any) => col.name === 'nickname')) {
          await db.execAsync('ALTER TABLE car ADD COLUMN nickname TEXT');
        }
        const docColumns = await db.getAllAsync<any>('PRAGMA table_info(docs)');
        if (!docColumns.some((col: any) => col.name === 'carId')) {
          await db.execAsync('ALTER TABLE docs ADD COLUMN carId INTEGER');
        }
        const mediaColumns = await db.getAllAsync<any>('PRAGMA table_info(project_media)');
        if (!mediaColumns.some((col: any) => col.name === 'carId')) {
          await db.execAsync('ALTER TABLE project_media ADD COLUMN carId INTEGER');
        }
        const logMediaColumns = await db.getAllAsync<any>('PRAGMA table_info(log_media)');
        if (!logMediaColumns.some((col: any) => col.name === 'carId')) {
          await db.execAsync('ALTER TABLE log_media ADD COLUMN carId INTEGER');
        }
        const projectColumns = await db.getAllAsync<any>('PRAGMA table_info(projects)');
        if (!projectColumns.some((col: any) => col.name === 'description')) {
          await db.execAsync('ALTER TABLE projects ADD COLUMN description TEXT');
        }
        if (!projectColumns.some((col: any) => col.name === 'category')) {
          await db.execAsync('ALTER TABLE projects ADD COLUMN category TEXT');
        }
        if (!projectColumns.some((col: any) => col.name === 'budgetPlanned')) {
          await db.execAsync('ALTER TABLE projects ADD COLUMN budgetPlanned REAL');
        }

        const carRows = await db.getAllAsync<any>('SELECT * FROM car ORDER BY id DESC');
        if (carRows.length) {
          const fallbackCarId = Number(carRows[0].id);
          await db.runAsync('UPDATE logs SET carId = ? WHERE carId IS NULL', [fallbackCarId]);
          await db.runAsync('UPDATE docs SET carId = ? WHERE carId IS NULL', [fallbackCarId]);
        }
        if (carRows.length) {
          const mappedCars = carRows.map((row: any) => ({
            id: Number(row.id),
            plate: row.plate,
            make: row.make,
            model: row.model,
            nickname: row.nickname,
            year: Number(row.year) || 0,
            vin: row.vin,
            nextEU: row.nextEU,
            mileage: Number(row.mileage) || 0,
            topSpeed: row.topSpeed,
            engineLiters: row.engineLiters,
            totalWeight: row.totalWeight,
            seats: row.seats,
            fuelType: row.fuelType
          }));
          setCars(mappedCars);
        }

        const typeRows = await db.getAllAsync<any>('SELECT name FROM types');
        if (typeRows.length) {
          const names = typeRows.map((row: any) => row.name);
          setLogTypes(names);
          setSelectedLogType(names[0] || 'service');
        } else {
          const defaults = ['service', 'repair', 'inspection', 'upgrade', 'fuel'];
          setLogTypes(defaults);
          setSelectedLogType('service');
          await db.withExclusiveTransactionAsync(async (tx) => {
            for (const name of defaults) {
              await tx.runAsync('INSERT OR IGNORE INTO types (name) VALUES (?)', [name]);
            }
          });
        }

        const settingsRows = await db.getAllAsync<any>('SELECT key, value FROM settings');
        let storedActiveCarId: number | null = null;
        settingsRows.forEach((row: any) => {
          if (row.key === 'units' && (row.value === 'km' || row.value === 'mi')) {
            setUnits(row.value);
          }
          if (row.key === 'appTheme' && ['system', 'light', 'dark'].includes(row.value)) {
            setAppTheme(row.value);
          }
          if (row.key === 'activeCarId' && row.value) {
            const parsed = Number(row.value);
            if (!Number.isNaN(parsed)) {
              storedActiveCarId = parsed;
            }
          }
          if (row.key === 'activeProjectId' && row.value) {
            settingsProjectIdRef.current = row.value;
          }
        });

        const activeId = storedActiveCarId ?? (carRows.length ? Number(carRows[0].id) : null);
        if (activeId) {
          setIsHydrating(true);
          setActiveCarId(activeId);
          const activeCar = carRows.find((row: any) => Number(row.id) === activeId);
          if (activeCar) {
            setCar({
              id: Number(activeCar.id),
              plate: activeCar.plate,
              make: activeCar.make,
              model: activeCar.model,
              nickname: activeCar.nickname,
              year: Number(activeCar.year) || 0,
              vin: activeCar.vin,
              nextEU: activeCar.nextEU,
              mileage: Number(activeCar.mileage) || 0,
              topSpeed: activeCar.topSpeed,
              engineLiters: activeCar.engineLiters,
              totalWeight: activeCar.totalWeight,
              seats: activeCar.seats,
              fuelType: activeCar.fuelType
            });
            setView('garage');
            pagerRef.current?.setPage(0);
          }
        }

        setDbReady(true);
      } catch (error) {
        console.warn('Failed to init local DB', error);
      }
    };

    initDb();
  }, []);

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

  useEffect(() => {
    if (!modals.projectDetail) return;
    projectDetailX.setValue(screenWidth);
    Animated.timing(projectDetailX, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [modals.projectDetail, projectDetailX, screenWidth]);

  const loadCarData = async (carId: number) => {
    if (!dbRef.current) return;
    const db = dbRef.current;
    setIsHydrating(true);

    try {
      const logRows = await db.getAllAsync<any>(
        'SELECT * FROM logs WHERE carId = ? ORDER BY date DESC, id DESC',
        [carId]
      );
      setLogs(
        logRows.map((row: any) => ({
          id: row.id,
          title: row.title,
          date: row.date,
          mileage: Number(row.mileage) || 0,
          cost: Number(row.cost) || 0,
          type: row.type,
          notes: row.notes || '',
          projectId: row.projectId || null,
          isSystemEvent: Number(row.isSystemEvent) === 1
        }))
      );

      const logMediaRows = await db.getAllAsync<any>(
        'SELECT * FROM log_media WHERE carId = ?',
        [carId]
      );
      setLogMedia(
        logMediaRows.map((row: any) => ({
          id: row.id,
          logId: row.logId,
          uri: row.uri,
          type: (row.type as 'image') || 'image',
          carId: Number(row.carId) || carId
        }))
      );

      const projectRows = await db.getAllAsync<any>(
        'SELECT * FROM projects WHERE carId = ? ORDER BY updatedAt DESC',
        [carId]
      );
      const mappedProjects = projectRows.map((row: any) => ({
        id: row.id,
        title: row.title,
        status: (row.status as Project['status']) || 'active',
        updatedAt: Number(row.updatedAt) || Date.now(),
        carId: Number(row.carId) || carId,
        description: row.description,
        category: row.category,
        budgetPlanned: row.budgetPlanned !== null && row.budgetPlanned !== undefined ? Number(row.budgetPlanned) : null
      }));
      setProjects(mappedProjects);
      const storedProjectId = settingsProjectIdRef.current;
      const nextProjectId =
        (storedProjectId && mappedProjects.some((p) => p.id === storedProjectId)
          ? storedProjectId
          : null) || mappedProjects[0]?.id || null;
      settingsProjectIdRef.current = null;
      setActiveProjectId(nextProjectId);

      const mediaRows = await db.getAllAsync<any>(
        'SELECT * FROM project_media WHERE carId = ?',
        [carId]
      );
      const mappedMedia = mediaRows.map((row: any) => ({
        id: row.id,
        projectId: row.projectId,
        uri: row.uri,
        type: (row.type as 'image') || 'image',
        carId: Number(row.carId) || carId
      }));
      setProjectMedia(mappedMedia);

      const docsRows = await db.getAllAsync<any>('SELECT * FROM docs WHERE carId = ?', [carId]);
      if (docsRows.length) {
        setDocs(
          docsRows.map((row: any) => ({
            id: row.id,
            title: row.title,
            expiry: row.expiry,
            type: row.type
          }))
        );
      } else {
        const seededDocs = DEFAULT_DOCS.map((doc) => ({
          ...doc,
          id: `${carId}-${doc.id}`
        }));
        setDocs(seededDocs);
        enqueueWrite(async () => {
          await db.withExclusiveTransactionAsync(async (tx: any) => {
            for (const doc of seededDocs) {
              await tx.runAsync(
                'INSERT OR IGNORE INTO docs (id, title, expiry, type, carId) VALUES (?, ?, ?, ?, ?)',
                [doc.id, doc.title, doc.expiry, doc.type, carId]
              );
            }
          });
        });
      }
    } finally {
      setIsHydrating(false);
    }
  };

  useEffect(() => {
    if (!dbReady || !activeCarId) return;
    loadCarData(activeCarId);
  }, [activeCarId, dbReady]);

  useEffect(() => {
    if (!activeCarId || !cars.length) return;
    const next = cars.find((item) => item.id === activeCarId) || null;
    if (next && (!car || car.id !== next.id)) {
      setCar(next);
    }
  }, [activeCarId, cars, car]);

  useEffect(() => {
    if (!dbReady || !dbRef.current || !car || isHydrating) return;
    const db = dbRef.current;
    enqueueWrite(async () => {
      await db.runAsync(
        `UPDATE car SET plate = ?, make = ?, model = ?, nickname = ?, year = ?, vin = ?, nextEU = ?, mileage = ?, topSpeed = ?, engineLiters = ?, totalWeight = ?, seats = ?, fuelType = ? WHERE id = ?`,
        [
          car.plate,
          car.make,
          car.model,
          car.nickname || null,
          car.year,
          car.vin,
          car.nextEU,
          car.mileage,
          car.topSpeed,
          car.engineLiters,
          car.totalWeight,
          car.seats,
          car.fuelType,
          car.id
        ]
      );
    });
  }, [car, dbReady, isHydrating]);

  useEffect(() => {
    if (!dbReady || !dbRef.current || !activeCarId || isHydrating) return;
    const db = dbRef.current;
    enqueueWrite(async () => {
      await db.withExclusiveTransactionAsync(async (tx: any) => {
        await tx.runAsync('DELETE FROM logs WHERE carId = ?', [activeCarId]);
        for (const log of logs) {
          await tx.runAsync(
            'INSERT OR REPLACE INTO logs (id, title, date, mileage, cost, type, notes, isSystemEvent, projectId, carId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              log.id,
              log.title,
              log.date,
              log.mileage,
              log.cost,
              log.type,
              log.notes,
              log.isSystemEvent ? 1 : 0,
              log.projectId || null,
              activeCarId
            ]
          );
        }
      });
    });
  }, [logs, dbReady, activeCarId, isHydrating]);

  useEffect(() => {
    if (!dbReady || !dbRef.current || !activeCarId || isHydrating) return;
    const db = dbRef.current;
    enqueueWrite(async () => {
      await db.withExclusiveTransactionAsync(async (tx: any) => {
        await tx.runAsync('DELETE FROM projects WHERE carId = ?', [activeCarId]);
        for (const project of projects) {
          await tx.runAsync(
            'INSERT OR REPLACE INTO projects (id, title, status, updatedAt, description, category, budgetPlanned, carId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              project.id,
              project.title,
              project.status,
              project.updatedAt,
              project.description || null,
              project.category || null,
              project.budgetPlanned ?? null,
              activeCarId
            ]
          );
        }
      });
    });
  }, [projects, dbReady, activeCarId, isHydrating]);

  useEffect(() => {
    if (!dbReady || !dbRef.current || !activeCarId || isHydrating) return;
    const db = dbRef.current;
    enqueueWrite(async () => {
      await db.withExclusiveTransactionAsync(async (tx: any) => {
        await tx.runAsync('DELETE FROM project_media WHERE carId = ?', [activeCarId]);
        for (const media of projectMedia) {
          await tx.runAsync(
            'INSERT OR REPLACE INTO project_media (id, projectId, uri, type, carId) VALUES (?, ?, ?, ?, ?)',
            [media.id, media.projectId, media.uri, media.type, activeCarId]
          );
        }
      });
    });
  }, [projectMedia, dbReady, activeCarId, isHydrating]);

  useEffect(() => {
    if (!dbReady || !dbRef.current || !activeCarId || isHydrating) return;
    const db = dbRef.current;
    enqueueWrite(async () => {
      await db.withExclusiveTransactionAsync(async (tx: any) => {
        await tx.runAsync('DELETE FROM log_media WHERE carId = ?', [activeCarId]);
        for (const media of logMedia) {
          await tx.runAsync(
            'INSERT OR REPLACE INTO log_media (id, logId, uri, type, carId) VALUES (?, ?, ?, ?, ?)',
            [media.id, media.logId, media.uri, media.type, activeCarId]
          );
        }
      });
    });
  }, [logMedia, dbReady, activeCarId, isHydrating]);

  useEffect(() => {
    if (!dbReady || !dbRef.current) return;
    const db = dbRef.current;
    enqueueWrite(async () => {
      await db.withExclusiveTransactionAsync(async (tx: any) => {
        await tx.runAsync('DELETE FROM types');
        for (const name of logTypes) {
          await tx.runAsync('INSERT OR IGNORE INTO types (name) VALUES (?)', [name]);
        }
      });
    });
  }, [logTypes, dbReady]);

  useEffect(() => {
    if (!dbReady || !dbRef.current) return;
    const db = dbRef.current;
    enqueueWrite(async () => {
      await db.withExclusiveTransactionAsync(async (tx: any) => {
        await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['units', units]);
        await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['appTheme', appTheme]);
        if (activeCarId) {
          await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['activeCarId', String(activeCarId)]);
          if (activeProjectId) {
            await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['activeProjectId', activeProjectId]);
          }
        }
      });
    });
  }, [units, appTheme, activeCarId, activeProjectId, dbReady]);

  useEffect(() => {
    if (!dbReady || !dbRef.current || !activeCarId || isHydrating) return;
    const db = dbRef.current;
    enqueueWrite(async () => {
      await db.withExclusiveTransactionAsync(async (tx: any) => {
        await tx.runAsync('DELETE FROM docs WHERE carId = ?', [activeCarId]);
        for (const doc of docs) {
          await tx.runAsync(
            'INSERT OR REPLACE INTO docs (id, title, expiry, type, carId) VALUES (?, ?, ?, ?, ?)',
            [doc.id, doc.title, doc.expiry, doc.type, activeCarId]
          );
        }
      });
    });
  }, [docs, dbReady, activeCarId, isHydrating]);

  const openAddLog = (projectId?: string | null) => {
    setEditingLog(null);
    setSelectedLogType('service');
    setDraftProjectId(typeof projectId === 'undefined' ? activeProjectId : projectId);
    setLogFormSeed(Date.now());
    setModals((prev) => ({ ...prev, addLog: true }));
  };
  const closeAddLog = () => {
    Animated.timing(addLogX, {
      toValue: screenWidth,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setEditingLog(null);
        setDraftProjectId(null);
        setModals((prev) => ({ ...prev, addLog: false }));
      }
    });
  };

  const openProjectDetail = (projectId: string) => {
    setProjectDetailId(projectId);
    setModals((prev) => ({ ...prev, projectDetail: true, projects: false }));
  };
  const closeProjectDetail = () => {
    Animated.timing(projectDetailX, {
      toValue: screenWidth,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setProjectDetailId(null);
        setProjectImageGrid({ projectId: null });
        setProjectMediaViewer(null);
        setModals((prev) => ({ ...prev, projectDetail: false }));
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
      if (dbReady && dbRef.current) {
        const db = dbRef.current;
        const existing = await db.getFirstAsync<any>('SELECT id FROM car WHERE plate = ?', [
          data.plate
        ]);
        let carId = existing?.id ? Number(existing.id) : null;
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

        await enqueueWrite(async () => {
          await db.withExclusiveTransactionAsync(async (tx: any) => {
            if (carId) {
              await tx.runAsync(
                `UPDATE car SET make = ?, model = ?, year = ?, vin = ?, nextEU = ?, mileage = ?, topSpeed = ?, engineLiters = ?, totalWeight = ?, seats = ?, fuelType = ? WHERE id = ?`,
                [
                  data.make,
                  data.model,
                  data.year,
                  data.vin,
                  data.nextEU,
                  data.mileage,
                  data.topSpeed,
                  data.engineLiters,
                  data.totalWeight,
                  data.seats,
                  data.fuelType,
                  carId
                ]
              );
            } else {
              const insertResult = await tx.runAsync(
                `INSERT INTO car (plate, make, model, nickname, year, vin, nextEU, mileage, topSpeed, engineLiters, totalWeight, seats, fuelType)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  data.plate,
                  data.make,
                  data.model,
                  null,
                  data.year,
                  data.vin,
                  data.nextEU,
                  data.mileage,
                  data.topSpeed,
                  data.engineLiters,
                  data.totalWeight,
                  data.seats,
                  data.fuelType
                ]
              );
              carId = insertResult.lastInsertRowId;
            }

            await tx.runAsync(
              'INSERT OR REPLACE INTO logs (id, title, date, mileage, cost, type, notes, isSystemEvent, carId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                initLog.id,
                initLog.title,
                initLog.date,
                initLog.mileage,
                initLog.cost,
                initLog.type,
                initLog.notes,
                initLog.isSystemEvent ? 1 : 0,
                carId
              ]
            );
          });
        });

        const savedCar: Car = { ...data, id: carId || Date.now(), nickname: null };
        setCars((prev) => {
          const next = prev.filter((c) => c.id !== savedCar.id);
          return [savedCar, ...next];
        });
        setCar(savedCar);
        setActiveCarId(savedCar.id);
        setLogs([initLog]);
        setIsHydrating(true);
        setView('garage');
        pagerRef.current?.setPage(0);
      }
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

  const handleCreateProject = (title: string) => {
    const clean = String(title || '').trim();
    if (!clean || !activeCarId) return null;
    const project: Project = {
      id: `project-${Date.now()}`,
      title: clean,
      status: 'active',
      updatedAt: Date.now(),
      carId: activeCarId,
      description: editingProject?.description || null,
      category: editingProject?.category || null,
      budgetPlanned: editingProject?.budgetPlanned ?? null
    };
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
    setDraftProjectId(project.id);
    setProjectDetailId(project.id);
    return project;
  };

  const touchProject = (projectId: string | null | undefined) => {
    if (!projectId) return;
    setProjects((prev) => {
      const next = [...prev];
      const idx = next.findIndex((p) => p.id === projectId);
      if (idx >= 0) {
        next[idx] = { ...next[idx], updatedAt: Date.now() };
        next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }
      return next;
    });
    setActiveProjectId(projectId);
  };

  const handleAddLog = (log: ServiceLog) => {
    // If mileage increased in log, update car
    if (car && log.mileage > car.mileage) {
      handleUpdateMileage(log.mileage); // This triggers the audit log too!
    }
    touchProject(log.projectId);
    setLogs([log, ...logs]);
  };

  const addMediaToProject = async (projectId: string, source: 'camera' | 'library') => {
    if (!activeCarId) return;
    try {
      const options: any = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsMultipleSelection: source === 'library',
      };
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Camera access is required to add photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }
      if (!result.canceled && result.assets?.length) {
        setProjectMedia((prev) => [
          ...result.assets.map((asset: any) => ({
            id: `media-${Date.now()}-${asset.uri}`,
            projectId,
            uri: asset.uri,
            type: 'image',
            carId: activeCarId!
          })),
          ...prev
        ]);
      }
    } catch (error) {
      console.warn('Failed to add media', error);
    }
  };

  const deleteProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const name = project?.title || 'project';
    Alert.alert('Delete project', `Are you sure you want to delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setProjects((prev) => prev.filter((p) => p.id !== projectId));
          setProjectMedia((prev) => prev.filter((m) => m.projectId !== projectId));
          setLogs((prev) => prev.map((l) => (l.projectId === projectId ? { ...l, projectId: null } : l)));
          if (activeProjectId === projectId) setActiveProjectId(null);
          closeProjectDetail();
        }
      }
    ]);
  };

  const updateProjectStatus = (projectId: string, status: Project['status']) => {
    setProjects((prev) =>
      prev
        .map((p) => (p.id === projectId ? { ...p, status, updatedAt: Date.now() } : p))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    );
  };

  const handleSaveNickname = (value: string) => {
    if (!car) return;
    const nickname = value.trim();
    const updated = { ...car, nickname };
    setCar(updated);
    setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, nickname } : c)));
  };

  const handleEditLog = (log: ServiceLog) => {
    setEditingLog(log);
    setSelectedLogType(log.type || 'service');
    setLogFormSeed(Date.now());
    setDraftProjectId(log.projectId || null);
    setModals((prev) => ({ ...prev, addLog: true }));
  };

  const handleDeleteLog = (log: ServiceLog) => {
    Alert.alert('Delete Log', 'Remove this log entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setLogs((prev) => prev.filter((item) => item.id !== log.id));
          setLogMedia((prev) => prev.filter((m) => m.logId !== log.id));
          if (editingLog?.id === log.id) {
            setEditingLog(null);
          }
        }
      }
    ]);
  };

  const deleteCar = () => {
    Alert.alert("Nuclear Option", "Delete this car and all history?", [
      { text: "Cancel", style: 'cancel' },
      { text: "Delete", style: 'destructive', onPress: () => {
        setCar(null);
        setLogs([]);
        setView('onboarding');
        if (dbReady && dbRef.current && activeCarId) {
          const db = dbRef.current;
          const removedId = activeCarId;
          enqueueWrite(async () => {
            await db.withExclusiveTransactionAsync(async (tx: any) => {
              await tx.runAsync('DELETE FROM car WHERE id = ?', [removedId]);
              await tx.runAsync('DELETE FROM logs WHERE carId = ?', [removedId]);
              await tx.runAsync('DELETE FROM docs WHERE carId = ?', [removedId]);
              await tx.runAsync('DELETE FROM projects WHERE carId = ?', [removedId]);
              await tx.runAsync('DELETE FROM log_media WHERE carId = ?', [removedId]);
              await tx.runAsync('DELETE FROM project_media WHERE carId = ?', [removedId]);
            });
          });
        }
        const remainingCars = cars.filter((item) => item.id !== activeCarId);
        setCars(remainingCars);
        if (remainingCars.length) {
          const next = remainingCars[0];
          setIsHydrating(true);
          setCar(next);
          setActiveCarId(next.id);
          setActiveProjectId(null);
          setProjectMedia([]);
          setLogMedia([]);
          setView('garage');
          pagerRef.current?.setPage(0);
        } else {
          setCar(null);
          setActiveCarId(null);
          setLogs([]);
          setDocs(DEFAULT_DOCS);
          setProjects([]);
          setActiveProjectId(null);
          setProjectMedia([]);
          setLogMedia([]);
          setView('onboarding');
        }
      } }
    ]);
  };

  // --- RENDER ---

  return (
    <ThemeContext.Provider value={{ theme, statusBarStyle }}>
      <StylesContext.Provider value={styles}>
        <View style={styles.container}>
          <Animated.View style={[styles.container, styles.appLayer, { transform: [{ translateX: appX }] }]}>
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
                    onEditLog={handleEditLog}
                    onDeleteLog={handleDeleteLog}
                    onOpenLogPhotos={(logId: string) => setLogMediaGrid({ logId })}
                    projects={projects}
                    logMedia={logMedia}
                    units={units}
                  />
                </View>
                <View key="logs" style={{ flex: 1, backgroundColor: theme.bg }}>
                  <TimelineScreen
                    logs={logs}
                    projects={projects}
                    logMedia={logMedia}
                    onOpenLog={openAddLog}
                    onShowProjects={() => setModals((prev) => ({ ...prev, projects: true }))}
                    onStartProject={() => setModals((prev) => ({ ...prev, projectForm: true }))}
                    onAddLogToProject={(projectId: string) => openAddLog(projectId)}
                    onOpenProject={openProjectDetail}
                    onEditLog={handleEditLog}
                    onDeleteLog={handleDeleteLog}
                    onOpenLogPhotos={(logId: string) => setLogMediaGrid({ logId })}
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
                    onEditNickname={() => setModals((prev) => ({ ...prev, nickname: true }))}
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
              onSave={(log: ServiceLog, photos: string[]) => {
                if (editingLog) {
                  setLogs((prev) => prev.map((item) => (item.id === log.id ? { ...item, ...log } : item)));
                } else {
                  handleAddLog(log);
                }
                if (activeCarId) {
                  setLogMedia((prev) => [
                    ...prev.filter((m) => m.logId !== log.id),
                    ...photos.map((uri) => ({
                      id: `media-${Date.now()}-${uri}`,
                      logId: log.id,
                      uri,
                      type: 'image',
                      carId: activeCarId,
                    }))
                  ]);
                }
                touchProject(log.projectId);
                closeAddLog();
                setSelectedLogType('service');
              }}
              mileagePlaceholder={car ? formatDistance(car.mileage, units).replace(/\\s?(km|mi)$/, '') : 'Auto'}
              logTypes={logTypes}
              logType={selectedLogType}
              onManageTypes={openTypes}
              units={units}
              initialLog={editingLog}
              projects={projects}
              selectedProjectId={draftProjectId}
              onSelectProject={setDraftProjectId}
              onRequestNewProject={() => {
                setEditingProject({
                  id: '',
                  title: '',
                  status: 'active',
                  updatedAt: Date.now(),
                  carId: activeCarId || 0,
                  description: null,
                  category: null,
                  budgetPlanned: null
                });
                setModals((prev) => ({ ...prev, projectForm: true, projects: false }));
              }}
              initialMediaUris={
                editingLog ? logMedia.filter((m) => m.logId === editingLog.id).map((m) => m.uri) : []
              }
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
              <ProjectsModal
                visible={modals.projects}
                projects={projects}
                logs={logs}
                onClose={() => setModals((prev) => ({ ...prev, projects: false }))}
                onStartProject={() => setModals((prev) => ({ ...prev, projectForm: true, projects: false }))}
                onAddLogToProject={(projectId: string) => {
                  setModals((prev) => ({ ...prev, projects: false }));
                  openAddLog(projectId);
                }}
                onOpenProject={openProjectDetail}
                themeKey={resolvedTheme}
              />
              <ProjectFormModal
                visible={modals.projectForm}
                project={editingProject}
                onClose={() => setModals((prev) => ({ ...prev, projectForm: false }))}
                onSave={(proj: Partial<Project>) => {
                  const cleanTitle = (proj.title || '').trim();
                  if (!cleanTitle) return;
                  const project: Project = {
                    id: `project-${Date.now()}`,
                    title: cleanTitle,
                    status: 'active',
                    updatedAt: Date.now(),
                    carId: activeCarId || 0,
                    description: (proj.description || '').trim() || null,
                    category: (proj.category || '').trim() || null,
                    budgetPlanned: proj.budgetPlanned ?? null
                  };
                  setProjects((prev) => [project, ...prev]);
                  setDraftProjectId(project.id);
                  openProjectDetail(project.id);
                  setModals((prev) => ({ ...prev, projectForm: false }));
                }}
              />
      {modals.projectDetail && projectDetailId && (
        <Animated.View style={[styles.addLogOverlay, { transform: [{ translateX: projectDetailX }], zIndex: 25 }]}>
          <ProjectDetailModal
            project={projects.find((p) => p.id === projectDetailId)}
            logs={logs.filter((l) => l.projectId === projectDetailId)}
            media={projectMedia.filter((m) => m.projectId === projectDetailId)}
            onClose={closeProjectDetail}
            onAddLog={() => {
              closeProjectDetail();
              setTimeout(() => openAddLog(projectDetailId), 240);
            }}
            onAddImage={(source: 'camera' | 'library') => addMediaToProject(projectDetailId, source)}
            onDelete={() => deleteProject(projectDetailId)}
            onOpenImage={(media: ProjectMedia) => {
              const combined = [
                ...projectMedia.filter((m) => m.projectId === projectDetailId),
                ...logMedia.filter((m) => logs.find((l) => l.id === m.logId && l.projectId === projectDetailId))
              ];
              const idx = combined.findIndex((m) => m.id === media.id);
              setProjectMediaViewer({
                projectId: projectDetailId,
                media: combined,
                index: idx >= 0 ? idx : 0
              });
            }}
            onComplete={(projectId: string) => updateProjectStatus(projectId, 'done')}
            onReopen={(projectId: string) => updateProjectStatus(projectId, 'active')}
            units={units}
            allLogMedia={logMedia.filter((m) => logs.some((l) => l.id === m.logId && l.projectId === projectDetailId))}
            onOpenGrid={() => setProjectImageGrid({ projectId: projectDetailId })}
          />
        </Animated.View>
      )}
      {projectMediaViewer && (
        <LogMediaViewer
          media={projectMediaViewer.media.map((m) => ({ id: m.id, uri: m.uri }))}
          startIndex={projectMediaViewer.index}
          onClose={() => {
            setProjectMediaViewer(null);
            if (projectGridReturn) {
              setProjectImageGrid({ projectId: projectGridReturn });
              setProjectGridReturn(null);
            }
          }}
          onDelete={(id: string) => {
            Alert.alert('Delete photo', 'Are you sure you want to delete this photo?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  setProjectMedia((prev) => prev.filter((m) => m.id !== id));
                  setProjectMediaViewer((prev) => {
                    if (!prev) return null;
                    const nextMedia = prev.media.filter((m) => m.id !== id);
                    if (!nextMedia.length) return null;
                    const nextIndex = Math.min(prev.index, nextMedia.length - 1);
                    return { ...prev, media: nextMedia, index: nextIndex };
                  });
                }
              }
            ]);
          }}
        />
      )}
              {projectImageGrid.projectId && (
                <ProjectMediaGrid
                  media={[
                    ...projectMedia.filter((m) => m.projectId === projectImageGrid.projectId),
                    ...logMedia.filter(
                      (m) => logs.find((l) => l.id === m.logId && l.projectId === projectImageGrid.projectId)
                    )
                  ]}
                  onClose={() => setProjectImageGrid({ projectId: null })}
                  onOpenFull={(index: number) => {
                    const combined = [
                      ...projectMedia.filter((m) => m.projectId === projectImageGrid.projectId),
                      ...logMedia.filter((m) => logs.find((l) => l.id === m.logId && l.projectId === projectImageGrid.projectId))
                    ];
                    const selected = combined[index];
                    if (selected) {
                      setProjectGridReturn(projectImageGrid.projectId!);
                      setProjectImageGrid({ projectId: null });
                      setProjectMediaViewer({
                        projectId: projectImageGrid.projectId!,
                        media: combined,
                        index
                      });
                    }
                  }}
                />
              )}
              {logMediaGrid.logId && (
                <LogMediaGrid
                  media={logMedia.filter((m) => m.logId === logMediaGrid.logId)}
                  onClose={() => setLogMediaGrid({ logId: null })}
                  onOpenFull={(index: number) => {
                    setLogGridReturn(logMediaGrid.logId);
                    setLogMediaGrid({ logId: null });
                    setLogMediaViewer({ logId: logMediaGrid.logId, index });
                  }}
                />
              )}
              {logMediaViewer.logId && logMedia.filter((m) => m.logId === logMediaViewer.logId).length > 0 && (
                <LogMediaViewer
                  media={logMedia.filter((m) => m.logId === logMediaViewer.logId)}
                  startIndex={logMediaViewer.index || 0}
                  onClose={() => {
                    setLogMediaViewer({ logId: null, index: 0 });
                    if (logGridReturn) {
                      setLogMediaGrid({ logId: logGridReturn });
                      setLogGridReturn(null);
                    }
                  }}
                />
              )}
              <SimpleInputModal
                visible={modals.nickname}
                title="Car Nickname"
                placeholder={car?.nickname || 'My ride'}
                keyboard="default"
                onClose={() => setModals((prev) => ({ ...prev, nickname: false }))}
                onSave={(val: string) => {
                  handleSaveNickname(val);
                  setModals((prev) => ({ ...prev, nickname: false }));
                }}
              />
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
          </Animated.View>
          <Animated.View
            style={[styles.container, styles.onboardingLayer, { transform: [{ translateX: onboardingX }] }]}
            pointerEvents={view === 'onboarding' ? 'auto' : 'none'}
          >
            <Onboarding
              onRegister={handleRegister}
              cars={cars}
              onSelectCar={(selected: Car) => {
                setIsHydrating(true);
                setCar(selected);
                setActiveCarId(selected.id);
                setView('garage');
                pagerRef.current?.setPage(0);
              }}
            />
          </Animated.View>
        </View>
      </StylesContext.Provider>
    </ThemeContext.Provider>
  );
}

// --- SCREENS ---

const GarageScreen = ({ car, logs, onOpenLog, onOpenMileage, onViewAllLogs, onEditLog, onDeleteLog, onOpenLogPhotos, units, projects, logMedia }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const projectNameById = React.useMemo(() => {
    const acc: Record<string, string> = {};
    (projects || []).forEach((p: Project) => {
      acc[p.id] = p.title;
    });
    return acc;
  }, [projects]);
  const logMediaCount = React.useMemo(() => {
    const map: Record<string, number> = {};
    (logMedia || []).forEach((m: LogMedia) => {
      map[m.logId] = (map[m.logId] || 0) + 1;
    });
    return map;
  }, [logMedia]);
  const safeCar = car ?? {};
  const nextEuRaw = safeCar.nextEU;
  const daysToEu = nextEuRaw
    ? Math.ceil((new Date(nextEuRaw).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
    : 0;
  const euStatus = nextEuRaw ? (daysToEu < 30 ? 'danger' : daysToEu < 120 ? 'warning' : 'success') : 'warning';
  const lastExpense = logs.find((log: ServiceLog) => log.cost > 0)?.cost || 0;
  const plateDisplay = String(safeCar.plate || '').replace(/\s+/g, '');
  const BrandLogo = getBrandLogo(safeCar.make);

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
          <Text style={styles.heroBrand}>{safeCar.make}</Text>
          {BrandLogo ? (
            <View style={styles.brandLogoWrap}>
              <BrandLogo width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
            </View>
          ) : (
            <Text style={styles.heroLogo}>LOGO</Text>
          )}
        </View>
        {!!safeCar.nickname && <Text style={styles.heroNickname}>{safeCar.nickname}</Text>}
        <Text style={styles.heroModel}>{safeCar.model}</Text>
        <View style={styles.heroBottomRow}>
          <Text style={styles.heroLinePlate}>{safeCar.year}</Text>
          <Text style={styles.heroLinePlate}>{plateDisplay}</Text>
        </View>

      </View>

      {/* Health Tiles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>STATUS</Text>
        <View style={styles.tileGrid}>
          <InfoTile
            label="Odometer"
            value={formatDistance(safeCar.mileage, units)}
            sub="Tap to update"
            tone={theme.primary}
            icon="speedometer"
            onPress={onOpenMileage}
          />
          <InfoTile
            label="EU Control"
            value={daysToEu < 0 ? 'Overdue' : `${daysToEu} days`}
            sub={nextEuRaw || 'N/A'}
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
        {logs.slice(0,3).map((l: ServiceLog) => (
          <LogRow
            key={l.id}
            log={l}
            units={units}
            projectName={l.projectId ? projectNameById[l.projectId] : undefined}
            photoCount={logMediaCount[l.id]}
            onOpenPhotos={() => onOpenLogPhotos?.(l.id)}
            onEdit={onEditLog}
            onDelete={onDeleteLog}
          />
        ))}
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

const TimelineScreen = ({
  logs,
  projects,
  onOpenLog,
  onShowProjects,
  onStartProject,
  onAddLogToProject,
  onOpenProject,
  onEditLog,
  onDeleteLog,
  onOpenLogPhotos,
  logMedia,
  themeKey,
  units
}: {
  logs: ServiceLog[];
  projects: Project[];
  onOpenLog: () => void;
  onShowProjects: () => void;
  onStartProject: () => void;
  onAddLogToProject: (id: string) => void;
  onOpenProject: (id: string) => void;
  onEditLog: (log: ServiceLog) => void;
  onDeleteLog: (log: ServiceLog) => void;
  onOpenLogPhotos: (id: string) => void;
  logMedia: LogMedia[];
  themeKey: string;
  units: 'km' | 'mi';
}) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const projectNameById = React.useMemo(() => {
    const acc: Record<string, string> = {};
    (projects || []).forEach((p: Project) => {
      acc[p.id] = p.title;
    });
    return acc;
  }, [projects]);
  const logMediaCount = React.useMemo(() => {
    const map: Record<string, number> = {};
    (logMedia || []).forEach((m: LogMedia) => {
      map[m.logId] = (map[m.logId] || 0) + 1;
    });
    return map;
  }, [logMedia]);
  const activeProjects = (projects || []).filter((p) => p.status !== 'done');
  const latestProject = activeProjects[0];
  const statsForProject = (projectId: string) => {
    const projectLogs = logs.filter((l) => l.projectId === projectId);
    const totalCost = projectLogs.reduce((sum, item) => sum + (item.cost || 0), 0);
    return { count: projectLogs.length, cost: totalCost };
  };
  return (
    <View style={styles.screenContainer}>
      <FlatList
        style={{ backgroundColor: theme.bg }}
        data={logs}
        extraData={themeKey}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            <View style={styles.pageHeaderRow}>
              <View>
                <Text style={styles.pageTitle}>Service Log</Text>
                <Text style={styles.pageSub}>Track maintenance and expenses.</Text>
              </View>
              <TouchableOpacity style={styles.headerIconBtn} onPress={onOpenLog}>
                <Ionicons name="add" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <View style={[styles.projectCard, !latestProject && { paddingVertical: 12, paddingHorizontal: 16 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => latestProject && onOpenProject(latestProject.id)}
                  activeOpacity={latestProject ? 0.8 : 1}
                  style={{ flex: 1 }}
                >
                  <Text style={styles.sectionTitle}>PROJECTS</Text>
                  <Text style={styles.pageTitleSmall}>{latestProject ? latestProject.title : 'No projects yet'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onShowProjects} style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
                  <Text style={{ color: theme.text }}>Show all</Text>
                </TouchableOpacity>
              </View>
              {latestProject ? (
                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={styles.projectBadge}>{latestProject.status.toUpperCase()}</Text>
                    <Text style={styles.projectMeta}>{new Date(latestProject.updatedAt).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.projectStats}>
                    {statsForProject(latestProject.id).count} logs • {statsForProject(latestProject.id).cost} kr
                  </Text>
                  <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { flex: 1 }]}
                      onPress={() => onAddLogToProject(latestProject.id)}
                    >
                      <Text style={styles.btnTxt}>Add log to project</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 6 }}>
                  <Text style={{ color: theme.textDim, marginBottom: 6 }}>
                    Start a project to group related work, like "Engine overhaul".
                  </Text>
                  <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10 }]} onPress={onStartProject}>
                    <Text style={styles.btnTxt}>Start project</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <LogRow
            log={item}
            units={units}
            projectName={item.projectId ? projectNameById[item.projectId] : undefined}
            photoCount={logMediaCount[item.id]}
            onOpenPhotos={() => onOpenLogPhotos(item.id)}
            onEdit={onEditLog}
            onDelete={onDeleteLog}
          />
        )}
      />
    </View>
  );
};

const ConfigScreen = ({ car, onDelete, onChangeCar, units, appTheme, onChangeUnits, onChangeAppTheme, onEditNickname }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const safeCar = car ?? {};
  return (
    <View style={styles.screenContainer}>
    <Text style={styles.pageTitle}>Settings</Text>
    
    <Text style={styles.settingsHeader}>VEHICLE</Text>
    <View style={styles.settingsGroup}>
      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>Plate Number</Text>
        <Text style={styles.settingsValue}>{safeCar.plate}</Text>
      </View>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsRow} onPress={onEditNickname}>
        <Text style={styles.settingsLabel}>Nickname</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.settingsValue, !safeCar.nickname && { color: theme.textDim }]}>
            {safeCar.nickname || 'Add nickname'}
          </Text>
          <Ionicons name="create-outline" size={18} color={theme.textDim} />
        </View>
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>VIN</Text>
        <Text style={styles.settingsValue}>{safeCar.vin}</Text>
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

const ProjectsModal = ({
  visible,
  projects,
  logs,
  onClose,
  onStartProject,
  onAddLogToProject,
  onOpenProject,
  themeKey
}: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const statsForProject = (projectId: string) => {
    const projectLogs = logs.filter((l: ServiceLog) => l.projectId === projectId);
    const totalCost = projectLogs.reduce((sum: number, item: ServiceLog) => sum + (item.cost || 0), 0);
    return { count: projectLogs.length, cost: totalCost };
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.modalOverlay, { padding: 12, justifyContent: 'center', alignItems: 'center' }]}>
        <View style={[styles.modalPopup, { width: '98%', maxHeight: '90%', padding: 16 }]}>
          <View style={[styles.modalHeader, { paddingHorizontal: 0, paddingBottom: 8 }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalH1}>Projects</Text>
            <TouchableOpacity onPress={onStartProject}>
              <Text style={styles.modalSaveText}>Create</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 6, gap: 16 }}>
            {projects.filter((p: Project) => p.status !== 'done').length === 0 &&
             projects.filter((p: Project) => p.status === 'done').length === 0 ? (
              <View style={{ padding: 12 }}>
                <Text style={{ color: theme.textDim, marginBottom: 10 }}>
                  No projects yet. Create one to group expenses.
                </Text>
                <TouchableOpacity style={[styles.primaryBtn]} onPress={onStartProject}>
                  <Text style={styles.btnTxt}>Create project</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {projects.filter((p: Project) => p.status !== 'done').length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={styles.sectionHeader}>ACTIVE</Text>
                {projects.filter((p: Project) => p.status !== 'done').map((item: Project) => {
                  const stats = statsForProject(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => onOpenProject(item.id)}
                      style={[styles.projectListItem, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pageTitleSmall}>{item.title}</Text>
                          <Text style={styles.projectMeta}>{item.status.toUpperCase()}</Text>
                          <Text style={styles.projectStats}>{stats.count} logs • {stats.cost} kr</Text>
                        </View>
                        <TouchableOpacity onPress={() => onAddLogToProject(item.id)} style={[styles.chip, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                          <Text style={{ color: theme.text }}>Add log</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {projects.filter((p: Project) => p.status === 'done').length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={styles.sectionHeader}>FINISHED</Text>
                {projects.filter((p: Project) => p.status === 'done').map((item: Project) => {
                  const stats = statsForProject(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => onOpenProject(item.id)}
                      style={[styles.projectListItem, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pageTitleSmall}>{item.title}</Text>
                          <Text style={styles.projectMeta}>{item.status.toUpperCase()}</Text>
                          <Text style={styles.projectStats}>{stats.count} logs • {stats.cost} kr</Text>
                        </View>
                        <TouchableOpacity onPress={() => onAddLogToProject(item.id)} style={[styles.chip, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                          <Text style={{ color: theme.text }}>Add log</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const ProjectDetailModal = ({
  project,
  logs,
  media,
  allLogMedia,
  onClose,
  onAddLog,
  onAddImage,
  onDelete,
  onOpenImage,
  onComplete,
  onReopen,
  onOpenGrid,
  units
}: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  if (!project) return null;
  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + 12 }]}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.modalH1}>{project.title}</Text>
        <TouchableOpacity onPress={() => onDelete(project)}>
          <Ionicons name="trash" size={20} color={theme.danger} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.projectBadge}>{project.status.toUpperCase()}</Text>
          <Text style={styles.projectMeta}>{new Date(project.updatedAt).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.projectStats}>{logs.length} logs</Text>
        <Text style={[styles.projectStats, { marginTop: 4 }]}>{logs.reduce((sum: number, l: ServiceLog) => sum + (l.cost || 0), 0)} kr total cost</Text>
        {project.budgetPlanned ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Ionicons name="wallet" size={14} color={theme.textDim} />
            <Text style={styles.projectMeta}>
              Planned {project.budgetPlanned} kr • Variance {(logs.reduce((sum: number, l: ServiceLog) => sum + (l.cost || 0), 0) - project.budgetPlanned)} kr
            </Text>
          </View>
        ) : null}
        {!!project.description && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.projectMeta}>{project.description}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={onAddLog}>
            <Text style={styles.btnTxt}>Add log</Text>
          </TouchableOpacity>
          {project.status !== 'done' ? (
            <TouchableOpacity
              style={[styles.tagButton, { flex: 1, backgroundColor: theme.success, borderColor: theme.success }]}
              onPress={() => onComplete(project.id)}>
              <Text style={{ color: 'white', fontWeight: '700', textAlign: 'center' }}>Mark complete</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.tagButton, { flex: 1, backgroundColor: theme.warning, borderColor: theme.warning }]}
              onPress={() => onReopen(project.id)}>
              <Text style={{ color: 'white', fontWeight: '700', textAlign: 'center' }}>Reopen project</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Images</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => onAddImage('library')}>
            <Text style={styles.btnTxt}>Add photos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, borderColor: theme.cardBorder }]} onPress={onOpenGrid}>
            <Text style={{ color: theme.text, textAlign: 'center' }}>View all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {[...media, ...allLogMedia].map((item: any) => (
            <Pressable key={item.id} onPress={() => onOpenImage(item)}>
              <ImageBackground
                source={{ uri: item.uri }}
                style={{ width: 120, height: 120 }}
                imageStyle={{ borderRadius: 12 }}
              />
            </Pressable>
          ))}
          {![...media, ...allLogMedia].length && <Text style={{ color: theme.textDim }}>No images yet.</Text>}
        </ScrollView>

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Logs</Text>
        {logs.map((log: ServiceLog) => (
          <View key={log.id} style={[styles.projectListItem, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}>
            <Text style={styles.pageTitleSmall}>{log.title}</Text>
            <Text style={styles.projectMeta}>{log.date}</Text>
          <Text style={styles.projectStats}>{log.cost} kr • {log.mileage ? formatDistance(log.mileage, units) : ''}</Text>
          {allLogMedia.filter((m: LogMedia) => m.logId === log.id).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              {allLogMedia
                .filter((m: LogMedia) => m.logId === log.id)
                .map((m: LogMedia) => (
                  <ImageBackground
                    key={m.id}
                    source={{ uri: m.uri }}
                    style={{ width: 64, height: 64 }}
                    imageStyle={{ borderRadius: 10 }}
                  />
                ))}
            </ScrollView>
          )}
        </View>
      ))}
      {!logs.length && <Text style={{ color: theme.textDim }}>No logs yet.</Text>}
    </ScrollView>
  </View>
  );
};

const LogMediaViewer = ({
  media,
  startIndex,
  onClose,
  onDelete
}: {
  media: { id: string; uri: string }[];
  startIndex: number;
  onClose: () => void;
  onDelete?: (id: string) => void;
}) => {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex || 0);
  const width = Dimensions.get('window').width;
  const height = Dimensions.get('window').height;
  return (
    <Modal visible transparent>
      <View style={styles.fullscreenOverlay}>
        <View style={[styles.fullscreenHeader, { top: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontWeight: '600' }}>
            {index + 1} / {media.length}
          </Text>
          {onDelete ? (
            <TouchableOpacity onPress={() => onDelete(media[index]?.id)}>
              <Ionicons name="trash" size={20} color="white" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>
        <FlatList
          horizontal
          pagingEnabled
          data={media}
          keyExtractor={(item) => item.id}
          initialScrollIndex={startIndex || 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
            setIndex(next);
          }}
          renderItem={({ item }) => (
            <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
              <ImageBackground
                source={{ uri: item.uri }}
                style={{ width: '100%', height: '100%' }}
                imageStyle={{ resizeMode: 'contain' }}
              />
            </View>
          )}
        />
      </View>
    </Modal>
  );
};

const LogMediaGrid = ({
  media,
  onClose,
  onOpenFull
}: {
  media: LogMedia[];
  onClose: () => void;
  onOpenFull: (index: number) => void;
}) => {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade">
      <View style={[styles.fullscreenOverlay, { paddingTop: insets.top + 20 }]}>
        <View style={[styles.fullscreenHeader, { top: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontWeight: '600' }}>Photos</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 20, paddingTop: 60 }}>
          {media.map((item, idx) => (
            <Pressable key={item.id} onPress={() => onOpenFull(idx)}>
              <ImageBackground
                source={{ uri: item.uri }}
                style={{ width: 120, height: 120 }}
                imageStyle={{ borderRadius: 12 }}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
};

const ProjectFormModal = ({
  visible,
  project,
  onClose,
  onSave
}: {
  visible: boolean;
  project: Project | null;
  onClose: () => void;
  onSave: (p: Partial<Project>) => void;
}) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const [title, setTitle] = useState(project?.title || '');
  const [description, setDescription] = useState(project?.description || '');
  const [category, setCategory] = useState(project?.category || '');
  const [budget, setBudget] = useState(project?.budgetPlanned ? String(project.budgetPlanned) : '');

  useEffect(() => {
    setTitle(project?.title || '');
    setDescription(project?.description || '');
    setCategory(project?.category || '');
    setBudget(project?.budgetPlanned ? String(project.budgetPlanned) : '');
  }, [project]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalPopup, { width: '92%' }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalH1}>New Project</Text>
            <TouchableOpacity
              onPress={() =>
                onSave({
                  title,
                  description,
                  category,
                  budgetPlanned: budget ? Number(budget) : null
                })
              }>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14 }}>
            <View style={styles.listGroup}>
              <View style={styles.listRow}>
                <Text style={styles.listLabel}>Title</Text>
                <TextInput
                  style={styles.listInput}
                  placeholder="Engine overhaul"
                  placeholderTextColor={theme.textDim}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>
              <View style={styles.listDivider} />
              <View style={[styles.listRow, { alignItems: 'flex-start' }]}>
                <Text style={styles.listLabel}>Notes</Text>
                <TextInput
                  style={[styles.listInput, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Scope, parts, goals"
                  placeholderTextColor={theme.textDim}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
              </View>
              <View style={styles.listDivider} />
              <View style={styles.listRow}>
                <Text style={styles.listLabel}>Category</Text>
                <TextInput
                  style={styles.listInput}
                  placeholder="Engine"
                  placeholderTextColor={theme.textDim}
                  value={category}
                  onChangeText={setCategory}
                />
              </View>
              <View style={styles.listDivider} />
              <View style={styles.listRow}>
                <Text style={styles.listLabel}>Planned</Text>
                <TextInput
                  style={styles.listInput}
                  placeholder="0"
                  placeholderTextColor={theme.textDim}
                  keyboardType="numeric"
                  value={budget}
                  onChangeText={setBudget}
                />
                <Text style={[styles.listLabel, { width: 30, textAlign: 'right' }]}>kr</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const ProjectMediaGrid = ({
  media,
  onClose,
  onOpenFull
}: {
  media: { id: string; uri: string }[];
  onClose: () => void;
  onOpenFull: (index: number) => void;
}) => {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade">
      <View style={[styles.fullscreenOverlay, { paddingTop: insets.top + 20 }]}>
        <View style={[styles.fullscreenHeader, { top: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontWeight: '600' }}>Project Photos</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 20, paddingTop: 60 }}>
          {media.map((item, idx) => (
            <Pressable key={item.id} onPress={() => onOpenFull(idx)}>
              <ImageBackground
                source={{ uri: item.uri }}
                style={{ width: 120, height: 120 }}
                imageStyle={{ borderRadius: 12 }}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
};

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

const LogRow = ({
  log,
  units,
  onEdit,
  onDelete,
  projectName,
  photoCount,
  onOpenPhotos
}: {
  log: ServiceLog;
  units: 'km' | 'mi';
  onEdit?: (log: ServiceLog) => void;
  onDelete?: (log: ServiceLog) => void;
  projectName?: string;
  photoCount?: number;
  onOpenPhotos?: () => void;
}) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const openActions = () => {
    const actions = ['Edit', 'Delete', 'Cancel'];
    const cancelIndex = 2;
    const destructiveIndex = 1;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: actions, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
        (buttonIndex) => {
          if (buttonIndex === 0) onEdit?.(log);
          if (buttonIndex === 1) onDelete?.(log);
        }
      );
      return;
    }
    Alert.alert('Log Entry', 'Choose an action', [
      { text: 'Edit', onPress: () => onEdit?.(log) },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(log) },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  return (
    <Pressable onLongPress={openActions} onPress={() => (photoCount ? onOpenPhotos?.() : undefined)}>
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
          {!!projectName && (
            <View style={styles.projectPill}>
              <Ionicons name="albums" size={12} color={theme.primary} />
              <Text style={[styles.logMeta, { color: theme.primary }]}>{projectName}</Text>
            </View>
          )}
          {!!photoCount && (
            <View style={[styles.projectPill, { borderColor: theme.primary, backgroundColor: theme.surface, marginTop: 6 }]}>
              <Ionicons name="image" size={12} color={theme.primary} />
              <Text style={[styles.logMeta, { color: theme.primary }]}>{photoCount} photo{photoCount > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
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

const AddLogModal = ({
  onClose,
  onSave,
  mileagePlaceholder,
  logTypes,
  logType,
  onManageTypes,
  units,
  initialLog,
  projects,
  selectedProjectId,
  onSelectProject,
  onRequestNewProject,
  initialMediaUris,
  formSeed
}: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');
  const [logDate, setLogDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const prevSeedRef = useRef<number | null>(null);
  const prevLogIdRef = useRef<string | null>(null);
  const formatLogDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const typeLabel = (value: LogType) =>
    String(value || '').replace(/^\w/, (char) => char.toUpperCase()) || 'Service';
  const availableTypes: LogType[] = logTypes?.length ? logTypes : ['service'];

  useEffect(() => {
    const seedChanged = formSeed !== prevSeedRef.current;
    const logChanged = (initialLog?.id || null) !== prevLogIdRef.current;
    if (!seedChanged && !logChanged) return;
    prevSeedRef.current = formSeed;
    prevLogIdRef.current = initialLog?.id || null;

    if (!initialLog) {
      setTitle('');
      setCost('');
      setMileage('');
      setNotes('');
      setLogDate(new Date());
      setProjectId(selectedProjectId || null);
      setPhotos(initialMediaUris || []);
      return;
    }
    setTitle(initialLog.title || '');
    setCost(initialLog.cost ? String(initialLog.cost) : '');
    const displayMileage =
      typeof initialLog.mileage === 'number'
        ? units === 'mi'
          ? Math.round(initialLog.mileage * 0.621371)
          : initialLog.mileage
        : '';
    setMileage(displayMileage ? String(displayMileage) : '');
    setNotes(initialLog.notes || '');
    setLogDate(initialLog.date ? new Date(initialLog.date) : new Date());
    setProjectId(initialLog.projectId || null);
    setPhotos(initialMediaUris || []);
  }, [formSeed, initialLog, units, initialMediaUris, selectedProjectId]);

  const projectLabel = () => {
    if (!projectId) return 'None';
    const match = projects?.find((p: Project) => p.id === projectId);
    return match?.title || 'Project';
  };

  const pickPhotos = async (source: 'camera' | 'library') => {
    try {
      const options: any = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsMultipleSelection: source === 'library',
      };
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Camera access is required to add photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }
      if (!result.canceled && result.assets?.length) {
        setPhotos((prev) => [...prev, ...result.assets.map((a: any) => a.uri)]);
      }
    } catch (error) {
      console.warn('Photo pick failed', error);
    }
  };

  return (
    <View style={[styles.modalBase, { backgroundColor: theme.bg }]}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.modalCancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.modalH1}>{initialLog ? 'Edit Log' : 'New Log'}</Text>
        <TouchableOpacity
            onPress={() => {
              onSelectProject?.(projectId || null);
              onSave(
                {
                  id: initialLog?.id || Date.now().toString(),
                  title: title || typeLabel(logType),
                  cost: parseInt(cost) || 0,
                  mileage: toKilometers(parseInt(mileage) || 0, units),
                  date: logDate.toISOString().split('T')[0],
                  type: logType,
                  notes,
                  projectId: projectId || null,
                  isSystemEvent: initialLog?.isSystemEvent || false
                },
                photos
              );
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
            <View style={styles.listDivider} />
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Project</Text>
              <View style={[styles.listValueRow, { flex: 1, justifyContent: 'flex-end' }]}>
                <Text style={styles.listValue}>{projectLabel()}</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
              showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => setProjectId(null)}
                style={[
                  styles.chip,
                  { backgroundColor: projectId ? theme.surface : theme.primary, borderColor: theme.cardBorder }
                ]}>
                <Text style={{ color: projectId ? theme.text : 'white', fontWeight: '600' }}>None</Text>
              </TouchableOpacity>
              {(projects || []).map((p: Project) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setProjectId(p.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: projectId === p.id ? theme.primary : theme.surface,
                      borderColor: theme.cardBorder
                    }
                  ]}>
                  <Text style={{ color: projectId === p.id ? 'white' : theme.text }}>{p.title}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={onRequestNewProject}
                style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
                <Text style={{ color: theme.primary, fontWeight: '700' }}>+ New</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Photos</Text>
          <View style={[styles.listGroup, { padding: 12, gap: 10 }]}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, borderColor: theme.cardBorder }]} onPress={() => pickPhotos('library')}>
                <Text style={{ color: theme.text, textAlign: 'center' }}>Add from library</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, borderColor: theme.cardBorder }]} onPress={() => pickPhotos('camera')}>
                <Text style={{ color: theme.text, textAlign: 'center' }}>Use camera</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {photos.map((uri: string) => (
                <Pressable key={uri} onLongPress={() => setPhotos((prev) => prev.filter((p) => p !== uri))}>
                  <ImageBackground
                    source={{ uri }}
                    style={{ width: 90, height: 90 }}
                    imageStyle={{ borderRadius: 10 }}
                  />
                </Pressable>
              ))}
              {!photos.length && <Text style={{ color: theme.textDim }}>No photos attached.</Text>}
            </ScrollView>
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

const Onboarding = ({ onRegister, cars, onSelectCar }: any) => {
  const { theme, statusBarStyle } = useTheme();
  const styles = useStyles();
  const [plate, setPlate] = useState('');
  const [load, setLoad] = useState(false);
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <SafeAreaView style={[styles.container, styles.onboardingWrap]}>
        <StatusBar style={statusBarStyle} />
        <View style={styles.onboardingCard}>
          <View style={styles.onboardingIcon}>
            <Ionicons name="car-sport" size={40} color={theme.primary} />
          </View>
          <Text style={styles.onboardingTitle}>Glovebox</Text>
          <Text style={styles.onboardingSub}>Log service history in seconds.</Text>
          {!!cars?.length && (
            <View style={styles.onboardingList}>
              <View style={styles.onboardingListGroup}>
                {cars.map((item: Car, index: number) => {
                  const BrandLogo = getBrandLogo(item.make);
                  return (
                    <View key={item.id}>
                      <TouchableOpacity style={styles.onboardingRow} onPress={() => onSelectCar(item)}>
                        <View style={styles.onboardingLogo}>
                          {BrandLogo ? (
                            <BrandLogo width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
                          ) : (
                            <Text style={styles.onboardingLogoText}>LOGO</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.onboardingRowTitle}>{item.nickname || `${item.make} ${item.model}`}</Text>
                          <Text style={styles.onboardingRowSub}>{String(item.plate || '').replace(/\s+/g, '')}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
                      </TouchableOpacity>
                      {index < cars.length - 1 && <View style={styles.onboardingDivider} />}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
          <TextInput 
            style={[styles.input, styles.onboardingInput]} 
            placeholder="LICENSE PLATE" 
            placeholderTextColor={theme.textDim}
            value={plate}
            onChangeText={setPlate}
            autoCapitalize="characters"
          />
          <TouchableOpacity 
            style={[styles.mainBtn, styles.onboardingBtn]} 
            onPress={() => { setLoad(true); onRegister(plate).finally(() => setLoad(false)); }}
          >
            {load ? <ActivityIndicator color="white" /> : <Text style={styles.btnTxt}>Start</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

// --- STYLES ---

const createStyles = (theme: typeof LIGHT_THEME) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  appLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  onboardingLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  screenContainer: { flex: 1, padding: 20, backgroundColor: theme.bg },
  onboardingWrap: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  onboardingCard: { width: '100%', maxWidth: 360, backgroundColor: theme.card, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  onboardingIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 1, borderColor: theme.cardBorder },
  onboardingTitle: { fontSize: 28, fontWeight: '700', color: theme.text },
  onboardingSub: { color: theme.textDim, marginTop: 4, marginBottom: 20 },
  onboardingList: { width: '100%', marginBottom: 16 },
  onboardingListGroup: { backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.cardBorder, overflow: 'hidden' },
  onboardingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  onboardingLogo: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  onboardingLogoText: { color: theme.primary, fontSize: 10, fontWeight: '700' },
  onboardingRowTitle: { color: theme.text, fontWeight: '600', fontSize: 14 },
  onboardingRowSub: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  onboardingDivider: { height: 1, backgroundColor: theme.cardBorder },
  onboardingInput: { width: '100%', textAlign: 'center', fontSize: 22 },
  onboardingBtn: { width: '100%' },
  
  // Hero
  heroContainer: { backgroundColor: theme.card, margin: 16, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.cardBorder, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  heroLogo: { fontSize: 16, color: theme.primary, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  brandLogoWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { color: theme.text, fontSize: 28, fontWeight: '700' },
  headerPill: { backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerPillText: { color: 'white', fontWeight: '600', fontSize: 12 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroNickname: { color: theme.textDim, fontStyle: 'italic', marginTop: 4 },
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
  projectCard: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.cardBorder, padding: 16, marginBottom: 20 },
  projectBadge: { color: theme.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  projectMeta: { color: theme.textDim, fontSize: 12 },
  projectStats: { color: theme.text, fontWeight: '600', marginTop: 4 },
  tagButton: { padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  projectListItem: { padding: 14, borderRadius: 14, borderWidth: 1, marginHorizontal: 16, marginBottom: 10 },
  projectPill: { marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.cardBorder },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  fullscreenOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullscreenHeader: { position: 'absolute', top: 40, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 },
  fullscreenImage: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  
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
  primaryBtn: { backgroundColor: theme.primary, padding: 12, borderRadius: 12, alignItems: 'center' },
  secondaryBtn: { backgroundColor: theme.surface, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  btnTxt: { fontWeight: '600', color: 'white' },
  
  // Vault
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.cardBorder },
  docIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  docTitle: { color: theme.text, fontWeight: '600', fontSize: 16 },
  docSub: { color: theme.textDim, fontSize: 12 },
  dashedBtn: { borderWidth: 1, borderColor: theme.cardBorder, borderStyle: 'dashed', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 10 },

  // Config
  pageTitle: { fontSize: 28, fontWeight: '700', color: theme.text, marginBottom: 4 },
  pageTitleSmall: { fontSize: 18, fontWeight: '700', color: theme.text },
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
