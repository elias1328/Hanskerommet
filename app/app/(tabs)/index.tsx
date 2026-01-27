import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActionSheetIOS,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Animated,
  LayoutAnimation,
  UIManager,
  ImageBackground,
  Dimensions,
  Keyboard,
  Switch,
  ToastAndroid,
  TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import PagerView from 'react-native-pager-view';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Swipeable } from 'react-native-gesture-handler';
import { getBrandLogo } from '../../brand-logos';
import { supabase } from '@/lib/supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { Fonts, THEME_PRESETS } from '@/constants/theme';
import { ThemeContext, StylesContext, useTheme, useStyles, createStyles } from '@/components/garage/theme';
import { ProjectDetailModal, GoalFormModal } from '@/components/garage/project-detail-modal';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { ThemeProvider, useAppTheme } from '@/context/ThemeContext';

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
type DocType = 'note' | 'receipt' | 'invoice' | 'registration' | 'other';

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
  expiry?: string | null;
  type: DocType;
  uri?: string | null;
  note?: string | null;
}

interface Project {
  id: string;
  title: string;
  status: 'planned' | 'active' | 'done';
  updatedAt: number;
  carId: string;
  description?: string | null;
  category?: string | null;
  budgetPlanned?: number | null;
}

interface ProjectGoal {
  id: string;
  projectId: string;
  title: string;
  status: 'open' | 'done';
  notes?: string | null;
  dueDate?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
}

interface ProjectMedia {
  id: string;
  projectId: string;
  uri: string;
  type: 'image';
  carId: string;
  storagePath?: string;
}

interface LogMedia {
  id: string;
  logId: string;
  uri: string;
  type: 'image';
  carId: string;
  storagePath?: string;
}

interface Car {
  id: string;
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
  { id: '1', title: 'Forsikringsbevis', expiry: '2025-01-01', type: 'other' },
  { id: '2', title: 'Vognkort (Del 2)', expiry: null, type: 'registration' }
];

const LOG_TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  repair: 'Reparasjon',
  inspection: 'EU-Kontroll',
  parts: 'Deler',
  tires: 'Dekk',
  other: 'Annet',
  upgrade: 'Oppgradering',
  fuel: 'Drivstoff',
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  note: 'Notat',
  receipt: 'Kvittering',
  invoice: 'Faktura',
  registration: 'Vognkort/Dokument',
  other: 'Annet'
};

const normalizeDocType = (value: string): DocType => {
  const key = String(value || '').toLowerCase();
  if (key === 'note' || key === 'receipt' || key === 'invoice' || key === 'registration' || key === 'other') {
    return key as DocType;
  }
  if (key === 'vognkort' || key === 'license') return 'registration';
  if (key === 'insurance') return 'other';
  return 'other';
};

const formatDocTypeLabel = (value: string) => DOC_TYPE_LABELS[normalizeDocType(value)] || 'Annet';


const formatLogTypeLabel = (value: string) => {
  const key = String(value || '').toLowerCase();
  return LOG_TYPE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Service');
};

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  planned: 'Planlagt',
  active: 'Aktiv',
  done: 'Fullført',
};

const formatProjectStatusLabel = (value: Project['status']) => PROJECT_STATUS_LABELS[value] || value;

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

const formatNumberWithSpaces = (value: string) => {
  const digits = String(value || '').replace(/\s+/g, '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const parseNumberWithSpaces = (value: string) =>
  parseInt(String(value || '').replace(/\s+/g, '').replace(/\D/g, ''), 10) || 0;

const mixColors = (a: string, b: string, amount: number) => {
  const toRgb = (hex: string) => {
    const raw = hex.replace('#', '');
    const normalized = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    const int = parseInt(normalized, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  };
  const c1 = toRgb(a);
  const c2 = toRgb(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return `rgb(${mix(c1.r, c2.r)},${mix(c1.g, c2.g)},${mix(c1.b, c2.b)})`;
};

const getPresetBorder = (preset: ThemePreset) =>
  preset.border ?? mixColors(preset.secondary, preset.accent, preset.scheme === 'light' ? 0.12 : 0.18);

const notifyCopied = () => {
  if (Platform.OS === 'android') ToastAndroid.show('Kopiert', ToastAndroid.SHORT);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

const copyToClipboard = async (value: string) => {
  const clean = String(value || '').trim();
  if (!clean) return;
  await Clipboard.setStringAsync(clean);
  notifyCopied();
};

// --- 2. API SERVICE ---

const getMockCar = (plate: string): Car => ({
  id: `${Date.now()}`,
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

  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (!anonKey || !supabaseUrl) {
    throw new Error('Mangler Supabase-miljøvariabler.');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/vehicle-lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${accessToken || anonKey}`,
    },
    body: JSON.stringify({ plate }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status;
    const message = data?.error || data?.message || 'Ukjent feil';
    throw new Error(`Oppslag feilet: ${message} (status ${status})`);
  }
  const raw = data?.kjoretoydataListe?.[0];
  if (!raw) throw new Error('Bil ikke funnet');

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
    id: `${Date.now()}`,
    plate: raw.kjennemerke?.[0]?.kjennemerke || plate,
    make: gen?.merke?.[0]?.merke || 'Ukjent',
    model: gen?.handelsbetegnelse?.[0] || 'Ukjent',
    year: raw?.godkjenning?.forstegangsGodkjenning?.forstegangRegistrertDato
      ? new Date(raw.godkjenning.forstegangsGodkjenning.forstegangRegistrertDato).getFullYear()
      : raw.forstegangsregistrering?.registrertForstegangNorgeDato
        ? new Date(raw.forstegangsregistrering.registrertForstegangNorgeDato).getFullYear()
        : 2000,
    vin: raw.kjoretoyId?.understellsnummer || 'Ukjent',
    nextEU: raw.periodiskKjoretoyKontroll?.kontrollfrist || 'N/A',
    mileage: raw?.godkjenning?.forstegangsGodkjenning?.bruktimport?.kilometerstand || 0,
    topSpeed: topSpeed ? `${topSpeed} km/h` : null,
    engineLiters: displacement ? `${(displacement / 1000).toFixed(1)} L` : null,
    totalWeight: totalWeight ? `${totalWeight} kg` : null,
    seats: seatsTotal ? String(seatsTotal) : null,
    fuelType: fuel
  };
};

const MEDIA_BUCKET = 'media';

const base64ToUint8Array = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const resizeAndUploadImage = async (
  uri: string,
  pathPrefix: string
): Promise<{ path: string; signedUrl: string }> => {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1280 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
    encoding: FileSystem.EncodingType?.Base64 ?? 'base64'
  });
  const bytes = base64ToUint8Array(base64);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const path = `${pathPrefix}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (signedError || !signed?.signedUrl) {
    throw new Error(signedError?.message || 'Kunne ikke signere medie-URL');
  }

  return { path, signedUrl: signed.signedUrl };
};

const createSignedUrlMap = async (paths: string[]) => {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error || !data) return new Map<string, string>();
  const map = new Map<string, string>();
  data.forEach((item) => {
    if (item.path && item.signedUrl) {
      map.set(item.path, item.signedUrl);
    }
  });
  return map;
};

const removeStoragePaths = async (paths: string[]) => {
  const cleaned = paths.filter(Boolean);
  if (!cleaned.length) return;
  await supabase.storage.from(MEDIA_BUCKET).remove(cleaned);
};

// --- 4. MAIN APP ---

function AppInner() {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const settingsProjectIdRef = useRef<string | null>(null);
  const tabKeys = ['garage', 'logs', 'projects', 'vault'] as const;
  const screenWidth = Dimensions.get('window').width;
  const appX = useRef(new Animated.Value(screenWidth)).current;
  const onboardingX = useRef(new Animated.Value(0)).current;
  const prevViewRef = useRef<'onboarding' | 'garage' | 'vault' | 'logs' | 'config'>('onboarding');
  const addLogX = useRef(new Animated.Value(screenWidth)).current;
  const typesX = useRef(new Animated.Value(screenWidth)).current;
  const projectDetailX = useRef(new Animated.Value(screenWidth)).current;
  const projectFormX = useRef(new Animated.Value(screenWidth)).current;
  const settingsX = useRef(new Animated.Value(screenWidth)).current;
  const settingsPrevRef = useRef<'garage' | 'logs' | 'projects' | 'vault'>('garage');
  const [view, setView] = useState<'onboarding' | 'garage' | 'vault' | 'logs' | 'config'>('onboarding');
  const [cars, setCars] = useState<Car[]>([]);
  const [car, setCar] = useState<Car | null>(null);
  const [activeCarId, setActiveCarId] = useState<string | null>(null);
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
  const [projectGoals, setProjectGoals] = useState<ProjectGoal[]>([]);
  const [projectMedia, setProjectMedia] = useState<ProjectMedia[]>([]);
  const [logMedia, setLogMedia] = useState<LogMedia[]>([]);
  const [units, setUnits] = useState<'km' | 'mi'>('km');
  const [appTheme, setAppTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [dbReady, setDbReady] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const { theme, themeKey, setThemeKey } = useAppTheme();

  const resolvedTheme = appTheme === 'system' ? theme.scheme : appTheme;
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
    username: false,
    goalForm: false,
    appearance: false,
  });
  const [editingLog, setEditingLog] = useState<ServiceLog | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingGoal, setEditingGoal] = useState<ProjectGoal | null>(null);
  const [goalFormProjectId, setGoalFormProjectId] = useState<string | null>(null);
  const [projectDetailId, setProjectDetailId] = useState<string | null>(null);
  const [projectMediaViewer, setProjectMediaViewer] = useState<{ projectId: string; media: { id: string; uri: string }[]; index: number } | null>(null);
  const [logMediaViewer, setLogMediaViewer] = useState<{ logId: string | null; index: number }>({ logId: null, index: 0 });
  const [logMediaGrid, setLogMediaGrid] = useState<{ logId: string | null }>({ logId: null });
  const [projectImageGrid, setProjectImageGrid] = useState<{ projectId: string | null }>({ projectId: null });
  const [projectGridReturn, setProjectGridReturn] = useState<string | null>(null);
  const [logGridReturn, setLogGridReturn] = useState<string | null>(null);
  const [logFormSeed, setLogFormSeed] = useState<number>(0);
  const [copyMenu, setCopyMenu] = useState<{ visible: boolean; value: string; x: number; y: number }>({
    visible: false,
    value: '',
    x: 0,
    y: 0
  });

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
    const initData = async () => {
      try {
        setIsHydrating(true);
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          setIsHydrating(false);
          return;
        }

        const uid = userData.user.id;
        setUserId(uid);
        setUserEmail(userData.user.email ?? null);
        const metaUsername = (userData.user.user_metadata as any)?.username;
        if (metaUsername) {
          setUsername(String(metaUsername));
        }

        const { data: carsData, error: carsError } = await supabase
          .from('cars')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });
        if (carsError) throw carsError;
        setCars(
          (carsData || []).map((row: any) => ({
            id: row.id,
            plate: row.plate,
            make: row.make,
            model: row.model,
            nickname: row.nickname,
            year: row.year || 0,
            vin: row.vin,
            nextEU: row.next_eu,
            mileage: row.mileage || 0,
            topSpeed: row.top_speed,
            engineLiters: row.engine_liters,
            totalWeight: row.total_weight,
            seats: row.seats,
            fuelType: row.fuel_type
          }))
        );

        const { data: typeRows, error: typeError } = await supabase
          .from('types')
          .select('name')
          .eq('user_id', uid);
        if (typeError) throw typeError;
        if (typeRows?.length) {
          const names = typeRows.map((row: any) => row.name);
          setLogTypes(names);
          setSelectedLogType(names[0] || 'service');
        } else {
          const defaults = ['service', 'repair', 'inspection', 'upgrade', 'fuel'];
          setLogTypes(defaults);
          setSelectedLogType('service');
          await supabase.from('types').insert(defaults.map((name) => ({ user_id: uid, name })));
        }

        const { data: settingsRows, error: settingsError } = await supabase
          .from('settings')
          .select('key,value')
          .eq('user_id', uid);
        if (settingsError) throw settingsError;
        (settingsRows || []).forEach((row: any) => {
          if (row.key === 'units' && (row.value === 'km' || row.value === 'mi')) {
            setUnits(row.value);
          }
          if (row.key === 'appTheme' && ['system', 'light', 'dark'].includes(row.value)) {
            setAppTheme(row.value);
          }
          if (row.key === 'activeProjectId' && row.value) {
            settingsProjectIdRef.current = row.value;
          }
        });

        setCar(null);
        setActiveCarId(null);
        setView('onboarding');
        setDbReady(true);

        const { data: profileRow } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', uid)
          .maybeSingle();
        if (profileRow?.username) {
          setUsername(profileRow.username);
        }
      } catch (error) {
        console.warn('Failed to init Supabase data', error);
      } finally {
        setIsHydrating(false);
      }
    };

    initData();
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

  const loadCarData = async (carId: string) => {
    if (!userId) {
      setIsHydrating(false);
      return;
    }
    setIsHydrating(true);

    try {
      const { data: logRows, error: logError } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', userId)
        .eq('car_id', carId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (logError) throw logError;
      setLogs(
        (logRows || []).map((row: any) => ({
          id: row.id,
          title: row.title,
          date: row.date,
          mileage: row.mileage || 0,
          cost: row.cost || 0,
          type: row.type,
          notes: row.notes || '',
          projectId: row.project_id || null,
          isSystemEvent: !!row.is_system_event
        }))
      );

      const { data: logMediaRows, error: logMediaError } = await supabase
        .from('log_media')
        .select('*')
        .eq('user_id', userId)
        .eq('car_id', carId);
      if (logMediaError) throw logMediaError;
      const logPaths = (logMediaRows || []).map((row: any) => row.uri).filter(Boolean);
      const logUrlMap = await createSignedUrlMap(logPaths);
      setLogMedia(
        (logMediaRows || []).map((row: any) => ({
          id: row.id,
          logId: row.log_id,
          uri: logUrlMap.get(row.uri) || row.uri,
          type: (row.type as 'image') || 'image',
          carId: row.car_id,
          storagePath: row.uri
        }))
      );

      const { data: projectRows, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .eq('car_id', carId)
        .order('updated_at', { ascending: false });
      if (projectError) throw projectError;
      const mappedProjects = (projectRows || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        status: (row.status as Project['status']) || 'active',
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
        carId: row.car_id,
        description: row.description,
        category: row.category,
        budgetPlanned:
          row.budget_planned !== null && row.budget_planned !== undefined ? Number(row.budget_planned) : null
      }));
      setProjects(mappedProjects);
      const storedProjectId = settingsProjectIdRef.current;
      const nextProjectId =
        storedProjectId && mappedProjects.some((p) => p.id === storedProjectId)
          ? storedProjectId
          : null;
      settingsProjectIdRef.current = null;
      setActiveProjectId(nextProjectId);

      if (mappedProjects.length) {
        const { data: goalRows, error: goalError } = await supabase
          .from('project_goals')
          .select('*')
          .eq('user_id', userId)
          .in('project_id', mappedProjects.map((p) => p.id))
          .order('created_at', { ascending: true });
        if (goalError) throw goalError;
        setProjectGoals(
          (goalRows || []).map((row: any) => ({
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            status: (row.status as ProjectGoal['status']) || 'open',
            notes: row.notes ?? null,
            dueDate: row.due_date ?? null,
            createdAt: row.created_at ?? null,
            completedAt: row.completed_at ?? null,
          }))
        );
      } else {
        setProjectGoals([]);
      }

      const { data: mediaRows, error: mediaError } = await supabase
        .from('project_media')
        .select('*')
        .eq('user_id', userId)
        .eq('car_id', carId);
      if (mediaError) throw mediaError;
      const projectPaths = (mediaRows || []).map((row: any) => row.uri).filter(Boolean);
      const projectUrlMap = await createSignedUrlMap(projectPaths);
      setProjectMedia(
        (mediaRows || []).map((row: any) => ({
          id: row.id,
          projectId: row.project_id,
          uri: projectUrlMap.get(row.uri) || row.uri,
          type: (row.type as 'image') || 'image',
          carId: row.car_id,
          storagePath: row.uri
        }))
      );

      const { data: docsRows, error: docsError } = await supabase
        .from('docs')
        .select('*')
        .eq('user_id', userId)
        .eq('car_id', carId);
      if (docsError) throw docsError;
      if (docsRows?.length) {
        setDocs(
          docsRows.map((row: any) => ({
            id: row.id,
            title: row.title,
            expiry: row.expiry ?? null,
            type: normalizeDocType(row.type),
            uri: row.uri ?? null,
            note: row.note ?? null
          }))
        );
      } else {
        const payload = DEFAULT_DOCS.map((doc) => ({
          user_id: userId,
          car_id: carId,
          title: doc.title,
          expiry: doc.expiry,
          type: doc.type
        }));
        const { data: insertedDocs } = await supabase.from('docs').insert(payload).select('*');
        if (insertedDocs?.length) {
          setDocs(
            insertedDocs.map((row: any) => ({
              id: row.id,
              title: row.title,
              expiry: row.expiry ?? null,
              type: normalizeDocType(row.type),
              uri: row.uri ?? null,
              note: row.note ?? null
            }))
          );
        } else {
          setDocs(DEFAULT_DOCS);
        }
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
    if (!dbReady || !userId) return;
    const updates = [
      { user_id: userId, key: 'units', value: units },
      { user_id: userId, key: 'appTheme', value: appTheme },
    ];
    if (activeProjectId) {
      updates.push({ user_id: userId, key: 'activeProjectId', value: activeProjectId });
      supabase.from('settings').upsert(updates, { onConflict: 'user_id,key' });
    } else {
      supabase.from('settings').upsert(updates, { onConflict: 'user_id,key' });
      supabase
        .from('settings')
        .delete()
        .eq('user_id', userId)
        .eq('key', 'activeProjectId');
    }
  }, [units, appTheme, activeProjectId, dbReady, userId]);


  const openAddLog = (projectId?: string | null) => {
    const nextProjectId = projectId && projectId.length ? projectId : null;
    setEditingLog(null);
    setSelectedLogType('service');
    setDraftProjectId(nextProjectId);
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
        'Oppdater kilometerstand',
        '',
        [
          { text: 'Avbryt', style: 'cancel' },
          {
            text: 'Lagre',
            onPress: (value) =>
              void handleUpdateMileage(toKilometers(parseInt(String(value), 10) || 0, units))
          }
        ],
        'plain-text',
        currentValue.toString()
      );
      return;
    }

    setModals((prev) => ({ ...prev, mileage: true }));
  };

  const openSettings = () => {
    settingsPrevRef.current = view === 'config' ? settingsPrevRef.current : view;
    setView('config');
    settingsX.setValue(screenWidth);
    Animated.timing(settingsX, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  };

  const closeSettings = () => {
    Animated.timing(settingsX, {
      toValue: screenWidth,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setView(settingsPrevRef.current);
    });
  };

  const openProjectForm = () => {
    projectFormX.setValue(screenWidth);
    setModals((prev) => ({ ...prev, projectForm: true }));
    Animated.timing(projectFormX, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  };

  const openProjectFormForEdit = (project: Project) => {
    setEditingProject(project);
    openProjectForm();
  };

  const closeProjectForm = () => {
    Animated.timing(projectFormX, {
      toValue: screenWidth,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setModals((prev) => ({ ...prev, projectForm: false }));
      setEditingProject(null);
    });
  };

  const openGoalForm = (projectId: string, goal?: ProjectGoal | null) => {
    setEditingGoal(goal ?? null);
    setGoalFormProjectId(projectId);
    setModals((prev) => ({ ...prev, goalForm: true }));
  };

  const closeGoalForm = () => {
    setModals((prev) => ({ ...prev, goalForm: false }));
    setEditingGoal(null);
    setGoalFormProjectId(null);
  };

  const navigateTo = (nextView: 'garage' | 'vault' | 'logs' | 'projects' | 'config') => {
    if (nextView === 'config') {
      setView('config');
      return;
    }
    setView(nextView);
    const nextIndex = tabKeys.indexOf(nextView);
    if (nextIndex >= 0) {
      pagerRef.current?.setPage(nextIndex);
    }
  };

  const handleRegister = async (plate: string) => {
    try {
      if (!userId) {
      Alert.alert('Ikke logget inn', 'Vennligst logg inn på nytt.');
        return;
      }
      const cleanPlate = String(plate || '').replace(/\s+/g, '');
      const data = await fetchCarDetails(cleanPlate);
      const { data: existingCar, error: existingError } = await supabase
        .from('cars')
        .select('*')
        .eq('user_id', userId)
        .eq('plate', data.plate)
        .maybeSingle();
      if (existingError) throw existingError;

      let savedCarRow = existingCar;
      if (existingCar) {
        const { data: updated, error: updateError } = await supabase
          .from('cars')
          .update({
            make: data.make,
            model: data.model,
            year: data.year,
            vin: data.vin,
            next_eu: data.nextEU,
            mileage: data.mileage,
            top_speed: data.topSpeed,
            engine_liters: data.engineLiters,
            total_weight: data.totalWeight,
            seats: data.seats,
            fuel_type: data.fuelType,
          })
          .eq('id', existingCar.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (updateError) throw updateError;
        savedCarRow = updated;
      } else {
        const { data: created, error: insertError } = await supabase
          .from('cars')
          .insert({
            user_id: userId,
            plate: data.plate,
            make: data.make,
            model: data.model,
            nickname: null,
            year: data.year,
            vin: data.vin,
            next_eu: data.nextEU,
            mileage: data.mileage,
            top_speed: data.topSpeed,
            engine_liters: data.engineLiters,
            total_weight: data.totalWeight,
            seats: data.seats,
            fuel_type: data.fuelType,
          })
          .select('*')
          .single();
        if (insertError) throw insertError;
        savedCarRow = created;

        await supabase.from('logs').insert({
          user_id: userId,
          car_id: savedCarRow.id,
          title: 'Bil lagt til i Hanskerommet',
          date: new Date().toISOString().split('T')[0],
          mileage: 0,
          cost: 0,
          type: 'system',
          notes: 'Kjøretøy importert via Statens Vegvesen API.',
          is_system_event: true,
        });
      }

      if (!savedCarRow) return;
      const savedCar: Car = {
        id: savedCarRow.id,
        plate: savedCarRow.plate,
        make: savedCarRow.make,
        model: savedCarRow.model,
        nickname: savedCarRow.nickname,
        year: savedCarRow.year || 0,
        vin: savedCarRow.vin,
        nextEU: savedCarRow.next_eu,
        mileage: savedCarRow.mileage || 0,
        topSpeed: savedCarRow.top_speed,
        engineLiters: savedCarRow.engine_liters,
        totalWeight: savedCarRow.total_weight,
        seats: savedCarRow.seats,
        fuelType: savedCarRow.fuel_type,
      };

      setCars((prev) => {
        const next = prev.filter((c) => c.id !== savedCar.id);
        return [savedCar, ...next];
      });
      setCar(savedCar);
      setActiveCarId(savedCar.id);
      setView('garage');
      pagerRef.current?.setPage(0);
      await loadCarData(savedCar.id);
    } catch (e: any) {
      const message = e?.message || 'Kunne ikke hente bildetaljer.';
      Alert.alert('Feil', message);
    }
  };

  const openCopyMenu = (value: string, event: any) => {
    if (Platform.OS !== 'android') return;
    const { pageX, pageY } = event?.nativeEvent || { pageX: 0, pageY: 0 };
    setCopyMenu({ visible: true, value, x: pageX, y: pageY });
  };

  const closeCopyMenu = () => setCopyMenu({ visible: false, value: '', x: 0, y: 0 });

  const handleUpdateMileage = async (newKm: number) => {
    if (!car || !userId) return;
    const oldKm = car.mileage;
    setCar({ ...car, mileage: newKm });
    setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, mileage: newKm } : c)));
    
    // AUDIT LOG
    const { data: logRow, error: logError } = await supabase
      .from('logs')
      .insert({
        user_id: userId,
        car_id: car.id,
        title: 'Kilometerstand korrigert',
        date: new Date().toISOString().split('T')[0],
        mileage: newKm,
        cost: 0,
        type: 'system',
        notes: `Manuell oppdatering: ${oldKm}km -> ${newKm}km`,
        is_system_event: true
      })
      .select('*')
      .single();
    if (logError) {
      Alert.alert('Oppdatering feilet', logError.message);
      return;
    }
    const auditLog: ServiceLog = {
      id: logRow.id,
      title: logRow.title,
      date: logRow.date,
      mileage: logRow.mileage || 0,
      cost: logRow.cost || 0,
      type: logRow.type,
      notes: logRow.notes || '',
      projectId: logRow.project_id || null,
      isSystemEvent: !!logRow.is_system_event
    };
    setLogs((prev) => [auditLog, ...prev]);
    await supabase
      .from('cars')
      .update({ mileage: newKm })
      .eq('id', car.id)
      .eq('user_id', userId);
    setModals({ ...modals, mileage: false });
  };

  const handleCreateProject = async (
    title: string,
    details?: { description?: string | null; category?: string | null; budgetPlanned?: number | null }
  ) => {
    const clean = String(title || '').trim();
    if (!clean || !activeCarId || !userId) return null;
    const { data: projectRow, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        car_id: activeCarId,
        title: clean,
        status: 'active',
        updated_at: new Date().toISOString(),
        description: details?.description ?? editingProject?.description ?? null,
        category: details?.category ?? editingProject?.category ?? null,
        budget_planned: details?.budgetPlanned ?? editingProject?.budgetPlanned ?? null
      })
      .select('*')
      .single();
    if (error || !projectRow) {
      Alert.alert('Prosjekt feilet', error?.message || 'Kunne ikke opprette prosjekt.');
      return null;
    }
    const project: Project = {
      id: projectRow.id,
      title: projectRow.title,
      status: projectRow.status || 'active',
      updatedAt: projectRow.updated_at ? new Date(projectRow.updated_at).getTime() : Date.now(),
      carId: projectRow.car_id,
      description: projectRow.description,
      category: projectRow.category,
      budgetPlanned:
        projectRow.budget_planned !== null && projectRow.budget_planned !== undefined
          ? Number(projectRow.budget_planned)
          : null
    };
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
    setDraftProjectId(project.id);
    setProjectDetailId(project.id);
    return project;
  };

  const handleUpdateProject = async (
    projectId: string,
    details: { title?: string; description?: string | null; category?: string | null; budgetPlanned?: number | null }
  ) => {
    if (!userId) return null;
    const payload: any = {
      updated_at: new Date().toISOString(),
    };
    if (details.title !== undefined) payload.title = details.title.trim();
    if (details.description !== undefined) payload.description = details.description;
    if (details.category !== undefined) payload.category = details.category;
    if (details.budgetPlanned !== undefined) payload.budget_planned = details.budgetPlanned;

    const { data: projectRow, error } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', projectId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error || !projectRow) {
      Alert.alert('Oppdatering feilet', error?.message || 'Kunne ikke oppdatere prosjekt.');
      return null;
    }
    const updated: Project = {
      id: projectRow.id,
      title: projectRow.title,
      status: (projectRow.status as Project['status']) || 'active',
      updatedAt: projectRow.updated_at ? new Date(projectRow.updated_at).getTime() : Date.now(),
      carId: projectRow.car_id,
      description: projectRow.description,
      category: projectRow.category,
      budgetPlanned:
        projectRow.budget_planned !== null && projectRow.budget_planned !== undefined
          ? Number(projectRow.budget_planned)
          : null
    };
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    return updated;
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
    if (userId) {
      supabase
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .eq('user_id', userId);
    }
  };

  const handleAddLog = async (log: ServiceLog, photos: string[]) => {
    if (!activeCarId || !userId) return false;
    if (car && log.mileage > car.mileage) {
      await handleUpdateMileage(log.mileage);
    }
    const { data: logRow, error: logError } = await supabase
      .from('logs')
      .insert({
        user_id: userId,
        car_id: activeCarId,
        title: log.title,
        date: log.date,
        mileage: log.mileage,
        cost: log.cost,
        type: log.type,
        notes: log.notes,
        is_system_event: log.isSystemEvent,
        project_id: log.projectId || null
      })
      .select('*')
      .single();
    if (logError || !logRow) {
      Alert.alert('Lagring feilet', logError?.message || 'Kunne ikke lagre logg.');
      return false;
    }

    const createdLog: ServiceLog = {
      id: logRow.id,
      title: logRow.title,
      date: logRow.date,
      mileage: logRow.mileage || 0,
      cost: logRow.cost || 0,
      type: logRow.type,
      notes: logRow.notes || '',
      projectId: logRow.project_id || null,
      isSystemEvent: !!logRow.is_system_event
    };
    setLogs((prev) => [createdLog, ...prev]);
    touchProject(createdLog.projectId);

    if (photos.length) {
      try {
        const uploads = await Promise.all(
          photos.map((uri) =>
            resizeAndUploadImage(uri, `${userId}/cars/${activeCarId}/logs/${createdLog.id}`)
          )
        );
        const { data: mediaRows } = await supabase
          .from('log_media')
          .insert(
            uploads.map((upload) => ({
              user_id: userId,
              car_id: activeCarId,
              log_id: createdLog.id,
              uri: upload.path,
              type: 'image'
            }))
          )
          .select('*');
        if (mediaRows?.length) {
          const signedMap = new Map(uploads.map((u) => [u.path, u.signedUrl]));
          setLogMedia((prev) => [
            ...mediaRows.map((row: any) => ({
              id: row.id,
              logId: row.log_id,
              uri: signedMap.get(row.uri) || row.uri,
              type: (row.type as 'image') || 'image',
              carId: row.car_id,
              storagePath: row.uri
            })),
            ...prev
          ]);
        }
      } catch (uploadError: any) {
        Alert.alert('Opplasting feilet', uploadError?.message || 'Kunne ikke laste opp bilder.');
      }
    }
    return true;
  };

  const handleUpdateLog = async (log: ServiceLog, photos: string[]) => {
    if (!activeCarId || !userId) return false;
    if (car && log.mileage > car.mileage) {
      await handleUpdateMileage(log.mileage);
    }
    const { data: logRow, error } = await supabase
      .from('logs')
      .update({
        title: log.title,
        date: log.date,
        mileage: log.mileage,
        cost: log.cost,
        type: log.type,
        notes: log.notes,
        is_system_event: log.isSystemEvent,
        project_id: log.projectId || null
      })
      .eq('id', log.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error || !logRow) {
      Alert.alert('Oppdatering feilet', error?.message || 'Kunne ikke oppdatere logg.');
      return false;
    }

    const updatedLog: ServiceLog = {
      id: logRow.id,
      title: logRow.title,
      date: logRow.date,
      mileage: logRow.mileage || 0,
      cost: logRow.cost || 0,
      type: logRow.type,
      notes: logRow.notes || '',
      projectId: logRow.project_id || null,
      isSystemEvent: !!logRow.is_system_event
    };
    setLogs((prev) => prev.map((item) => (item.id === log.id ? updatedLog : item)));
    touchProject(updatedLog.projectId);

    const oldPaths = logMedia
      .filter((m) => m.logId === log.id)
      .map((m) => m.storagePath)
      .filter(Boolean) as string[];
    await supabase.from('log_media').delete().eq('log_id', log.id).eq('user_id', userId);
    await removeStoragePaths(oldPaths);

    if (photos.length) {
      try {
        const uploads = await Promise.all(
          photos.map((uri) =>
            resizeAndUploadImage(uri, `${userId}/cars/${activeCarId}/logs/${log.id}`)
          )
        );
        const { data: mediaRows } = await supabase
          .from('log_media')
          .insert(
            uploads.map((upload) => ({
              user_id: userId,
              car_id: activeCarId,
              log_id: log.id,
              uri: upload.path,
              type: 'image'
            }))
          )
          .select('*');
        if (mediaRows?.length) {
          const signedMap = new Map(uploads.map((u) => [u.path, u.signedUrl]));
          setLogMedia((prev) => [
            ...prev.filter((m) => m.logId !== log.id),
            ...mediaRows.map((row: any) => ({
              id: row.id,
              logId: row.log_id,
              uri: signedMap.get(row.uri) || row.uri,
              type: (row.type as 'image') || 'image',
              carId: row.car_id,
              storagePath: row.uri
            }))
          ]);
        }
      } catch (uploadError: any) {
        Alert.alert('Opplasting feilet', uploadError?.message || 'Kunne ikke laste opp bilder.');
      }
    } else {
      setLogMedia((prev) => prev.filter((m) => m.logId !== log.id));
    }
    return true;
  };

  const handleAddDocument = async (
    payload:
      | {
          title: string;
          type: DocType;
          expiry?: string | null;
          note?: string | null;
          uri?: string | null;
        }
      | Array<{
          title: string;
          type: DocType;
          expiry?: string | null;
          note?: string | null;
          uri?: string | null;
        }>
  ) => {
    if (!userId || !activeCarId) return;
    try {
      const items = Array.isArray(payload) ? payload : [payload];
      const insertPayload = items.map((item) => ({
        user_id: userId,
        car_id: activeCarId,
        title: item.title,
        expiry: item.expiry ?? null,
        type: item.type,
        note: item.note ?? null,
        uri: item.uri ?? null,
      }));
      const { data, error } = await supabase.from('docs').insert(insertPayload).select('*');
      if (error || !data) {
        Alert.alert('Kunne ikke lagre', error?.message || 'Prøv igjen senere.');
        return;
      }
      const inserted = data.map((row: any, idx: number) => ({
        id: row.id,
        title: row.title,
        expiry: row.expiry ?? null,
        type: normalizeDocType(row.type),
        uri: row.uri ?? items[idx]?.uri ?? null,
        note: row.note ?? items[idx]?.note ?? null,
      }));
      setDocs((prev) => [...inserted, ...prev]);
    } catch (error) {
      console.warn('Add document failed', error);
    }
  };

  const handleDeleteDocument = async (doc: Doc) => {
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    if (userId) {
      await supabase.from('docs').delete().eq('id', doc.id).eq('user_id', userId);
    }
  };

  const addMediaToProject = async (projectId: string, source: 'camera' | 'library') => {
    if (!activeCarId || !userId) return;
    try {
      const options: any = {
        mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsMultipleSelection: source === 'library',
      };
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Tillatelse kreves', 'Kameratilgang kreves for å legge til bilder.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }
      if (!result.canceled && result.assets?.length) {
        const uploads = await Promise.all(
          result.assets.map((asset: any) =>
            resizeAndUploadImage(asset.uri, `${userId}/cars/${activeCarId}/projects/${projectId}`)
          )
        );
        const payload = uploads.map((upload) => ({
          user_id: userId,
          car_id: activeCarId,
          project_id: projectId,
          uri: upload.path,
          type: 'image'
        }));
        const { data: mediaRows, error } = await supabase
          .from('project_media')
          .insert(payload)
          .select('*');
        if (error) {
          Alert.alert('Opplasting feilet', error.message);
          return;
        }
        if (mediaRows?.length) {
          const signedMap = new Map(uploads.map((u) => [u.path, u.signedUrl]));
          setProjectMedia((prev) => [
            ...mediaRows.map((row: any) => ({
              id: row.id,
              projectId: row.project_id,
              uri: signedMap.get(row.uri) || row.uri,
              type: (row.type as 'image') || 'image',
              carId: row.car_id,
              storagePath: row.uri
            })),
            ...prev
          ]);
        }
      }
    } catch (error) {
      console.warn('Failed to add media', error);
    }
  };

  const deleteProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const name = project?.title || 'project';
    Alert.alert('Slett prosjekt', `Er du sikker på at du vil slette "${name}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Slett',
        style: 'destructive',
        onPress: async () => {
          const projectMediaPaths = projectMedia
            .filter((m) => m.projectId === projectId)
            .map((m) => m.storagePath)
            .filter(Boolean) as string[];
          setProjects((prev) => prev.filter((p) => p.id !== projectId));
          setProjectMedia((prev) => prev.filter((m) => m.projectId !== projectId));
          setProjectGoals((prev) => prev.filter((g) => g.projectId !== projectId));
          setLogs((prev) => prev.map((l) => (l.projectId === projectId ? { ...l, projectId: null } : l)));
          if (activeProjectId === projectId) setActiveProjectId(null);
          closeProjectDetail();
          if (userId) {
            await supabase.from('logs').update({ project_id: null }).eq('project_id', projectId).eq('user_id', userId);
            await supabase.from('project_media').delete().eq('project_id', projectId).eq('user_id', userId);
            await supabase.from('projects').delete().eq('id', projectId).eq('user_id', userId);
            if (projectMediaPaths.length) {
              await removeStoragePaths(projectMediaPaths);
            }
          }
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
    if (userId) {
      supabase
        .from('projects')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .eq('user_id', userId);
    }
  };

  const saveProjectGoal = async (input: { title: string; notes?: string | null; dueDate?: string | null }) => {
    if (!userId || !goalFormProjectId) return null;
    const cleanTitle = input.title.trim();
    if (!cleanTitle) return null;
    const normalizedDue = input.dueDate ? new Date(input.dueDate).toISOString().slice(0, 10) : null;

    if (editingGoal?.id) {
      const { data: goalRow, error } = await supabase
        .from('project_goals')
        .update({
          title: cleanTitle,
          notes: input.notes ?? null,
          due_date: normalizedDue,
        })
        .eq('id', editingGoal.id)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error || !goalRow) {
        Alert.alert('Kunne ikke oppdatere målet', error?.message || 'Prøv igjen senere.');
        return null;
      }
      const updated: ProjectGoal = {
        id: goalRow.id,
        projectId: goalRow.project_id,
        title: goalRow.title,
        status: (goalRow.status as ProjectGoal['status']) || 'open',
        notes: goalRow.notes ?? null,
        dueDate: goalRow.due_date ?? null,
        createdAt: goalRow.created_at ?? null,
        completedAt: goalRow.completed_at ?? null,
      };
      setProjectGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      return updated;
    }

    const { data: goalRow, error } = await supabase
      .from('project_goals')
      .insert({
        user_id: userId,
        project_id: goalFormProjectId,
        title: cleanTitle,
        status: 'open',
        notes: input.notes ?? null,
        due_date: normalizedDue,
      })
      .select('*')
      .single();
    if (error || !goalRow) {
      Alert.alert('Kunne ikke legge til mål', error?.message || 'Prøv igjen senere.');
      return null;
    }
    const goal: ProjectGoal = {
      id: goalRow.id,
      projectId: goalRow.project_id,
      title: goalRow.title,
      status: (goalRow.status as ProjectGoal['status']) || 'open',
      notes: goalRow.notes ?? null,
      dueDate: goalRow.due_date ?? null,
      createdAt: goalRow.created_at ?? null,
      completedAt: goalRow.completed_at ?? null,
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setProjectGoals((prev) => [goal, ...prev]);
    return goal;
  };

  const toggleProjectGoal = async (goal: ProjectGoal) => {
    if (!userId) return;
    const nextStatus: ProjectGoal['status'] = goal.status === 'done' ? 'open' : 'done';
    const { data: goalRow, error } = await supabase
      .from('project_goals')
      .update({
        status: nextStatus,
        completed_at: nextStatus === 'done' ? new Date().toISOString() : null,
      })
      .eq('id', goal.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error || !goalRow) {
      Alert.alert('Kunne ikke oppdatere målet', error?.message || 'Prøv igjen senere.');
      return;
    }
    const updated: ProjectGoal = {
      id: goalRow.id,
      projectId: goalRow.project_id,
      title: goalRow.title,
      status: (goalRow.status as ProjectGoal['status']) || 'open',
      notes: goalRow.notes ?? null,
      dueDate: goalRow.due_date ?? null,
      createdAt: goalRow.created_at ?? null,
      completedAt: goalRow.completed_at ?? null,
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setProjectGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    if (nextStatus === 'done') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.selectionAsync();
    }
  };

  const deleteProjectGoal = async (goalId: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from('project_goals')
      .delete()
      .eq('id', goalId)
      .eq('user_id', userId);
    if (error) {
      Alert.alert('Kunne ikke slette målet', error.message);
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setProjectGoals((prev) => prev.filter((g) => g.id !== goalId));
  };

  const handleSaveNickname = async (value: string) => {
    if (!car) return;
    const nickname = value.trim();
    const updated = { ...car, nickname };
    setCar(updated);
    setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, nickname } : c)));
    const resolvedUserId = userId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!resolvedUserId) {
      Alert.alert('Kunne ikke lagre', 'Mangler brukerinfo. Vennligst prøv igjen.');
      return;
    }
    const { error } = await supabase
      .from('cars')
      .update({ nickname: nickname || null })
      .eq('id', car.id)
      .eq('user_id', resolvedUserId);
    if (error) {
      Alert.alert('Kunne ikke lagre', error.message);
    }
  };

  const handleSaveUsername = async (value: string) => {
    if (!userId) return;
    const clean = value.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(clean)) {
      Alert.alert('Ugyldig brukernavn', 'Bruk 3–24 tegn (bokstaver, tall eller underscore).');
      return;
    }
    if (username && clean.toLowerCase() === username.toLowerCase()) {
      setModals((prev) => ({ ...prev, username: false }));
      return;
    }
    const availability = await supabase.rpc('is_username_available', { p_username: clean });
    if (availability.error || availability.data === false) {
      Alert.alert('Brukernavn opptatt', 'Velg et annet brukernavn.');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: userId, username: clean });
    if (error) {
      Alert.alert('Kunne ikke lagre', error.message);
      return;
    }
    await supabase.auth.updateUser({ data: { username: clean } });
    setUsername(clean);
    setModals((prev) => ({ ...prev, username: false }));
  };

  const handleEditLog = (log: ServiceLog) => {
    setEditingLog(log);
    setSelectedLogType(log.type || 'service');
    setLogFormSeed(Date.now());
    setDraftProjectId(log.projectId || null);
    setModals((prev) => ({ ...prev, addLog: true }));
  };

  const handleDeleteLog = (log: ServiceLog) => {
    Alert.alert('Slett logg', 'Fjerne denne loggoppføringen?', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Slett',
        style: 'destructive',
        onPress: async () => {
          const logMediaPaths = logMedia
            .filter((m) => m.logId === log.id)
            .map((m) => m.storagePath)
            .filter(Boolean) as string[];
          setLogs((prev) => prev.filter((item) => item.id !== log.id));
          setLogMedia((prev) => prev.filter((m) => m.logId !== log.id));
          if (editingLog?.id === log.id) {
            setEditingLog(null);
          }
          if (userId) {
            await supabase.from('log_media').delete().eq('log_id', log.id).eq('user_id', userId);
            await supabase.from('logs').delete().eq('id', log.id).eq('user_id', userId);
            if (logMediaPaths.length) {
              await removeStoragePaths(logMediaPaths);
            }
          }
        }
      }
    ]);
  };

  useEffect(() => {
    if (!dbReady) return;
    if (view !== 'onboarding' && (!activeCarId || !car)) {
      setView('onboarding');
      pagerRef.current?.setPage(0);
    }
  }, [activeCarId, car, dbReady, view]);

  useEffect(() => {
    if (!dbReady || !userId) return;
    if (!username) {
      setModals((prev) => ({ ...prev, username: true }));
    }
  }, [dbReady, userId, username]);

  const handleSignOut = () => {
    Alert.alert('Logg ut', 'Logg ut av kontoen din?', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Logg ut',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) {
            Alert.alert('Utlogging feilet', error.message);
          } else {
            setUserId(null);
            setUserEmail(null);
            setUsername(null);
            setCars([]);
            setCar(null);
            setActiveCarId(null);
            setLogs([]);
            setProjects([]);
            setDocs(DEFAULT_DOCS);
            setLogMedia([]);
            setProjectMedia([]);
            setActiveProjectId(null);
            setView('onboarding');
            setDbReady(false);
          }
        },
      },
    ]);
  };

  const deleteCar = () => {
    Alert.alert("Siste utvei", "Slett denne bilen og all historikk?", [
      { text: "Avbryt", style: 'cancel' },
      { text: "Slett", style: 'destructive', onPress: async () => {
        setCar(null);
        setLogs([]);
        setView('onboarding');
        if (userId && activeCarId) {
          await supabase.from('cars').delete().eq('id', activeCarId).eq('user_id', userId);
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
                scrollEnabled={!modals.projectDetail}
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
                    onOpenSettings={openSettings}
                    onSwitchCar={() => setView('onboarding')}
                    onShowCopyMenu={openCopyMenu}
                  />
                </View>
                <View key="logs" style={{ flex: 1, backgroundColor: theme.bg }}>
                  <TimelineScreen
                    logs={logs}
                    projects={projects}
                    logMedia={logMedia}
                    onOpenLog={openAddLog}
                    onEditLog={handleEditLog}
                    onDeleteLog={handleDeleteLog}
                    onOpenLogPhotos={(logId: string) => setLogMediaGrid({ logId })}
                    themeKey={resolvedTheme}
                    units={units}
                  />
                </View>
                <View key="projects" style={{ flex: 1, backgroundColor: theme.bg }}>
                  <ProjectsScreen
                    logs={logs}
                    projects={projects}
                    goals={projectGoals}
                    activeProjectId={activeProjectId}
                    onStartProject={openProjectForm}
                    onAddLogToProject={(projectId: string) => openAddLog(projectId)}
                    onOpenProject={openProjectDetail}
                    onSetActiveProject={setActiveProjectId}
                  />
                </View>
                <View key="vault" style={{ flex: 1, backgroundColor: theme.bg }}>
                  <VaultScreen
                    docs={docs}
                    themeKey={resolvedTheme}
                    onAddDocument={handleAddDocument}
                    onDeleteDocument={handleDeleteDocument}
                  />
                </View>
              </PagerView>

              {view === 'config' && (
                <Animated.View style={[styles.container, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: theme.bg, transform: [{ translateX: settingsX }] }]}>
                  <ConfigScreen
                    car={car!}
                    onDelete={deleteCar}
                    onChangeCar={() => setView('onboarding')}
                    units={units}
                    appTheme={appTheme}
                    onChangeUnits={setUnits}
                    onChangeAppTheme={setAppTheme}
                    onOpenAppearance={() => setModals((prev) => ({ ...prev, appearance: true }))}
                    onEditNickname={() => setModals((prev) => ({ ...prev, nickname: true }))}
                    onSignOut={handleSignOut}
                    onClose={closeSettings}
                    username={username}
                    onShowCopyMenu={openCopyMenu}
                  />
                </Animated.View>
              )}

              {/* --- CUSTOM TAB BAR (Perfectly Centered FAB) --- */}
              <View style={[styles.tabBarContainer, { height: 49 + insets.bottom }]}>
                <BlurView intensity={50} tint={theme.blurTint} style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
                  <View style={styles.tabBarContent}>
                    <TabBtn iconName="truck" label="Min Bil" active={view === 'garage'} onPress={() => navigateTo('garage')} />
                    <TabBtn iconName="tool" label="Logg" active={view === 'logs'} onPress={() => navigateTo('logs')} />
                    <TabBtn iconName="folder" label="Prosjekter" active={view === 'projects'} onPress={() => navigateTo('projects')} />
                    <TabBtn iconName="file-text" label="Dokumenter" active={view === 'vault'} onPress={() => navigateTo('vault')} />
                  </View>
                </BlurView>

              </View>

              {/* --- MODALS --- */}
              {modals.addLog && (
                <Animated.View style={[styles.addLogOverlay, { transform: [{ translateX: addLogX }] }]}>
                  <AddLogModal
                    onClose={closeAddLog}
                    onSave={async (log: ServiceLog, photos: string[]) => {
                      const ok = editingLog
                        ? await handleUpdateLog(log, photos)
                        : await handleAddLog(log, photos);
                      if (!ok) return;
                      closeAddLog();
                      setSelectedLogType('service');
                    }}
                    mileagePlaceholder={car ? formatDistance(car.mileage, units).replace(/\s?(km|mi)$/, '') : 'Auto'}
                    logTypes={logTypes}
                    logType={selectedLogType}
                    onSetLogType={setSelectedLogType}
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
                        carId: activeCarId || '',
                        description: null,
                        category: null,
                        budgetPlanned: null
                      });
                      openProjectForm();
                    }}
                    initialMediaUris={
                      editingLog ? logMedia.filter((m) => m.logId === editingLog.id).map((m) => m.uri) : []
                    }
                    currentMileage={car?.mileage || 0}
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
                    onAddType={async (value: string) => {
                      const clean = value.trim();
                      if (!clean) return;
                      setLogTypes((prev) => {
                        if (prev.includes(clean)) return prev;
                        return [...prev, clean];
                      });
                      if (userId) {
                        await supabase.from('types').insert({ user_id: userId, name: clean });
                      }
                    }}
                    onRemoveType={async (value: string) => {
                      const next = logTypes.filter((type) => type !== value);
                      const finalTypes = next.length ? next : ['service'];
                      if (value === selectedLogType) {
                        setSelectedLogType(finalTypes[0] || 'service');
                      }
                      setLogTypes(finalTypes);
                      if (userId) {
                        await supabase.from('types').delete().eq('user_id', userId).eq('name', value);
                        if (!next.length) {
                          await supabase.from('types').insert({ user_id: userId, name: 'service' });
                        }
                      }
                    }}
                  />
                </Animated.View>
              )}
              {modals.projectForm && (
                <Animated.View style={[styles.addLogOverlay, { transform: [{ translateX: projectFormX }] }]}>
                  <ProjectFormModal
                    visible={modals.projectForm}
                    project={editingProject}
                    onClose={closeProjectForm}
                    onSave={async (proj: Partial<Project>) => {
                      const cleanTitle = (proj.title || '').trim();
                      if (!cleanTitle) return;
                      if (editingProject?.id) {
                        const updated = await handleUpdateProject(editingProject.id, {
                          title: cleanTitle,
                          description: (proj.description || '').trim() || null,
                          budgetPlanned: proj.budgetPlanned ?? null
                        });
                        if (updated) {
                          setProjectDetailId(updated.id);
                          closeProjectForm();
                        }
                        return;
                      }
                      const project = await handleCreateProject(cleanTitle, {
                        description: (proj.description || '').trim() || null,
                        budgetPlanned: proj.budgetPlanned ?? null
                      });
                      if (!project) return;
                      setDraftProjectId(project.id);
                      openProjectDetail(project.id);
                      closeProjectForm();
                    }}
                  />
                </Animated.View>
              )}
              {modals.goalForm && (
                <Animated.View style={[styles.addLogOverlay, { zIndex: 40 }]}>
                  <GoalFormModal
                    visible={modals.goalForm}
                    goal={editingGoal}
                    onClose={closeGoalForm}
                    onSave={async (payload: { title: string; notes?: string | null; dueDate?: string | null }) => {
                      const saved = await saveProjectGoal(payload);
                      if (saved) {
                        closeGoalForm();
                      }
                    }}
                  />
                </Animated.View>
              )}
              {modals.projectDetail && projectDetailId && (
                <Animated.View style={[styles.addLogOverlay, { transform: [{ translateX: projectDetailX }], zIndex: 25 }]}>
                  <ProjectDetailModal
                    project={projects.find((p) => p.id === projectDetailId)}
                    logs={logs.filter((l) => l.projectId === projectDetailId)}
                    media={projectMedia.filter((m) => m.projectId === projectDetailId)}
                    goals={projectGoals.filter((g) => g.projectId === projectDetailId)}
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
                    onAddGoal={() => openGoalForm(projectDetailId)}
                    onEditGoal={(goal: ProjectGoal) => openGoalForm(projectDetailId, goal)}
                    onToggleGoal={(goal: ProjectGoal) => toggleProjectGoal(goal)}
                    onDeleteGoal={(goal: ProjectGoal) => deleteProjectGoal(goal.id)}
                    onEditProject={() => {
                      const project = projects.find((p) => p.id === projectDetailId);
                      if (project) {
                        openProjectFormForEdit(project);
                      }
                    }}
                    formatDistance={formatDistance}
                    formatProjectStatusLabel={formatProjectStatusLabel}
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
                    Alert.alert('Slett bilde', 'Er du sikker på at du vil slette dette bildet?', [
                      { text: 'Avbryt', style: 'cancel' },
                      {
                        text: 'Slett',
                        style: 'destructive',
                        onPress: async () => {
                          const projectItem = projectMedia.find((m) => m.id === id);
                          const logItem = logMedia.find((m) => m.id === id);
                          const storagePaths = [projectItem?.storagePath, logItem?.storagePath].filter(Boolean) as string[];
                          setProjectMedia((prev) => prev.filter((m) => m.id !== id));
                          setLogMedia((prev) => prev.filter((m) => m.id !== id));
                          setProjectMediaViewer((prev) => {
                            if (!prev) return null;
                            const nextMedia = prev.media.filter((m) => m.id !== id);
                            if (!nextMedia.length) return null;
                            const nextIndex = Math.min(prev.index, nextMedia.length - 1);
                            return { ...prev, media: nextMedia, index: nextIndex };
                          });
                          if (userId) {
                            await supabase.from('project_media').delete().eq('id', id).eq('user_id', userId);
                            await supabase.from('log_media').delete().eq('id', id).eq('user_id', userId);
                            if (storagePaths.length) {
                              await removeStoragePaths(storagePaths);
                            }
                          }
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
                title="Kallenavn på bilen"
                placeholder={car?.nickname || 'Min bil'}
                keyboard="default"
                onClose={() => setModals((prev) => ({ ...prev, nickname: false }))}
                onSave={(val: string) => {
                  handleSaveNickname(val);
                  setModals((prev) => ({ ...prev, nickname: false }));
                }}
              />
              <SimpleInputModal
                visible={modals.username}
                title="Vennligst sett et brukernavn"
                placeholder="brukernavn"
                keyboard="default"
                onClose={() => {
                  Alert.alert('Brukernavn kreves', 'Du må sette et brukernavn for å fortsette.');
                }}
                onSave={(val: string) => {
                  handleSaveUsername(val);
                }}
              />
              <SimpleInputModal
                visible={modals.mileage}
                title="Oppdater kilometerstand"
          placeholder={
            car
              ? formatDistance(car.mileage, units).replace(/\\s?(km|mi)$/, '')
              : undefined
          }
          keyboard="numeric"
          onClose={() => setModals({...modals, mileage: false})}
          onSave={(val) => void handleUpdateMileage(toKilometers(parseNumberWithSpaces(val), units))}
          units={units}
        />
              {copyMenu.visible && (
                <Modal transparent animationType="fade">
                  <Pressable style={{ flex: 1 }} onPress={closeCopyMenu}>
                    <View
                      style={[
                        styles.copyMenu,
                        {
                          left: Math.max(12, copyMenu.x - 40),
                          top: Math.max(20, copyMenu.y - 48),
                        },
                      ]}
                    >
                      <TouchableOpacity
                        onPress={() => {
                          copyToClipboard(copyMenu.value);
                          closeCopyMenu();
                        }}
                      >
                        <Text style={styles.copyMenuText}>Kopier</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
              )}
              {modals.appearance && (
                <Modal transparent animationType="fade">
                  <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setModals((prev) => ({ ...prev, appearance: false }))}
                  >
                    <Pressable style={[styles.modalPopup, { maxHeight: '80%', width: '100%' }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={styles.popupTitle}>Apputseende</Text>
                        <TouchableOpacity onPress={() => setModals((prev) => ({ ...prev, appearance: false }))}>
                          <Feather name="x" size={20} color={theme.textDim} />
                        </TouchableOpacity>
                      </View>
                      <ScrollView>
                        {THEME_PRESETS.map((preset) => {
                          const selected = themeKey === preset.key;
                          return (
                            <TouchableOpacity
                              key={preset.key}
                              style={[styles.settingsRow, { paddingHorizontal: 0 }]}
                              onPress={() => setThemeKey(preset.key)}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <Feather
                                  name="check"
                                  size={16}
                                  color={selected ? '#2563EB' : 'transparent'}
                                />
                                <Text style={styles.settingsLabel}>{preset.name}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 10 }}>
                                {[preset.primary, preset.secondary, preset.accent, getPresetBorder(preset)].map((color) => (
                                  <View
                                    key={color}
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 11,
                                      backgroundColor: color,
                                      borderWidth: 1,
                                      borderColor: '#FFFFFF',
                                    }}
                                  />
                                ))}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </Pressable>
                  </Pressable>
                </Modal>
              )}
            </SafeAreaView>
          </Animated.View>
          <Animated.View
            style={[styles.container, styles.onboardingLayer, { transform: [{ translateX: onboardingX }] }]}
            pointerEvents={view === 'onboarding' ? 'auto' : 'none'}
          >
            <Onboarding
              onRegister={handleRegister}
              cars={cars}
              userEmail={userEmail}
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

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

// --- SCREENS ---

const GarageScreen = ({ car, logs, onOpenLog, onOpenMileage, onViewAllLogs, onEditLog, onDeleteLog, onOpenLogPhotos, units, projects, logMedia, onOpenSettings, onSwitchCar, onShowCopyMenu }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
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
  const lastLogDate = logs.length
    ? new Date(
        logs.reduce((latest: number, l: ServiceLog) => {
          const t = new Date(l.date).getTime();
          return t > latest ? t : latest;
        }, 0)
      ).toLocaleDateString('nb-NO')
    : '—';
  const plateDisplay = String(safeCar.plate || '').replace(/\s+/g, '');
  const BrandLogo = getBrandLogo(safeCar.make);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[styles.stickyHeader, { paddingTop: insets.top }]} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>MIN BIL</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={[styles.secondaryBtnSmall, { justifyContent: 'center', alignItems: 'center' }]} onPress={onSwitchCar}>
              <Text style={styles.secondaryBtnText}>BYTT BIL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtnGhost} onPress={onOpenSettings}>
              <Feather name="settings" size={20} color={theme.textDim} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ paddingTop: Math.max(0, headerHeight - 8), paddingBottom: 140 }}
      >

      <View style={styles.specSheet}>
        <View style={styles.specRow}>
          <View>
            <Text style={styles.specMake}>{safeCar.make || '—'}</Text>
            {safeCar.nickname ? <Text style={styles.specNickname}>"{safeCar.nickname}"</Text> : null}
            <Text style={styles.specModel}>{safeCar.model || 'Ukjent modell'}</Text>
          </View>
          <View style={styles.specLogo}>
            {BrandLogo ? (
              <View style={{ width: '100%', height: '100%', opacity: 0.7 }}>
                <BrandLogo width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
              </View>
            ) : (
              <Feather name="truck" size={28} color={theme.textDim} />
            )}
          </View>
        </View>
        {Platform.OS === 'ios' ? (
          <View style={styles.specPlateBox}>
            <Text style={styles.specPlateText} selectable>{plateDisplay || '—'}</Text>
          </View>
        ) : (
          <Pressable style={styles.specPlateBox} onPress={(e) => onShowCopyMenu?.(plateDisplay, e)}>
            <Text style={styles.specPlateText}>{plateDisplay || '—'}</Text>
          </Pressable>
        )}
        {Platform.OS === 'ios' ? (
          <View style={styles.vinRow}>
            <Text style={styles.vinLabel}>CHASSIS NO</Text>
            <Text style={styles.vinValue} selectable>{safeCar.vin || '—'}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.vinRow} onPress={(e) => onShowCopyMenu?.(safeCar.vin || '', e)}>
            <Text style={styles.vinLabel}>CHASSIS NO</Text>
            <Text style={styles.vinValue}>{safeCar.vin || '—'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>STATUS</Text>
        <View style={styles.statusGrid}>
          <TouchableOpacity style={styles.statusTile} onPress={onOpenMileage} activeOpacity={0.8}>
            <View style={styles.statusTileHeader}>
              <Feather name="activity" size={18} color={theme.textDim} />
              <Feather name="edit-2" size={16} color={theme.textDim} />
            </View>
            <Text style={styles.statusTileLabel}>KILOMETER</Text>
            <Text style={styles.statusTileValue}>{formatDistance(safeCar.mileage, units)}</Text>
            <Text style={styles.statusTileSub}>Oppdater</Text>
          </TouchableOpacity>

          <View style={styles.statusTile}>
            <View style={styles.statusTileHeader}>
              <Feather name="calendar" size={18} color={theme.textDim} />
            </View>
            <Text style={styles.statusTileLabel}>EU-KONTROLL</Text>
            <Text style={[styles.statusTileValue, { color: theme[euStatus] }]}>
              {daysToEu < 0 ? 'FORFALT' : `${daysToEu} DAGER`}
            </Text>
            <Text style={styles.statusTileSub}>{nextEuRaw || 'Ukjent dato'}</Text>
          </View>

          <View style={styles.statusTile}>
            <View style={styles.statusTileHeader}>
              <Feather name="tool" size={18} color={theme.textDim} />
            </View>
            <Text style={styles.statusTileLabel}>SISTE LOGG</Text>
            <Text style={styles.statusTileValue}>{lastLogDate}</Text>
            <Text style={styles.statusTileSub}>Dato</Text>
          </View>

          <TouchableOpacity
            style={[styles.statusTile, styles.statusTileAction]}
            onPress={onOpenLog}
            activeOpacity={0.85}
          >
            <View style={styles.statusTileHeader}>
              <Feather name="plus" size={18} color={theme.onAccent} />
            </View>
            <Text style={{ color: theme.onAccent, textAlign: 'center', fontSize: 16, fontWeight: '800' }}>
              + NY HURTIGLOGG
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent History */}
      <View style={styles.section}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
          <Text style={styles.sectionTitle}>SISTE AKTIVITET</Text>
          <TouchableOpacity onPress={onViewAllLogs}><Text style={{color: theme.primary, fontWeight: '700'}}>Vis alle</Text></TouchableOpacity>
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
    </View>
  );
};

const VaultScreen = ({
  docs,
  themeKey,
  onAddDocument,
  onDeleteDocument
}: {
  docs: Doc[];
  themeKey: string;
  onAddDocument: (payload: { title: string; type: DocType; expiry?: string | null; note?: string | null; uri?: string | null } | Array<{ title: string; type: DocType; expiry?: string | null; note?: string | null; uri?: string | null }>) => void;
  onDeleteDocument: (doc: Doc) => void;
}) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [filterType, setFilterType] = useState<DocType | 'all'>('all');
  const [viewerDoc, setViewerDoc] = useState<Doc | null>(null);
  const [docFormVisible, setDocFormVisible] = useState(false);
  const [docType, setDocType] = useState<DocType>('receipt');
  const [docTitle, setDocTitle] = useState('');
  const [docNote, setDocNote] = useState('');
  const [docHasExpiry, setDocHasExpiry] = useState(false);
  const [docExpiry, setDocExpiry] = useState<Date | null>(null);
  const [docImageUris, setDocImageUris] = useState<string[]>([]);
  const [viewerFullScreen, setViewerFullScreen] = useState(false);
  const [showDocDatePicker, setShowDocDatePicker] = useState(false);

  const openDocForm = (type: DocType) => {
    setDocType(type);
    setDocTitle('');
    setDocNote('');
    setDocHasExpiry(false);
    setDocExpiry(null);
    setDocImageUris([]);
    setShowDocDatePicker(false);
    setDocFormVisible(true);
  };

  const openAddDocument = () => {
    const options = ['Notat', 'Kvittering', 'Faktura', 'Vognkort/Dokument', 'Annet', 'Avbryt'];
    const cancelButtonIndex = 5;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex }, (index) => {
        if (index === 0) openDocForm('note');
        if (index === 1) openDocForm('receipt');
        if (index === 2) openDocForm('invoice');
        if (index === 3) openDocForm('registration');
        if (index === 4) openDocForm('other');
      });
      return;
    }
    Alert.alert('Legg til dokument', 'Velg type', [
      { text: 'Notat', onPress: () => openDocForm('note') },
      { text: 'Kvittering', onPress: () => openDocForm('receipt') },
      { text: 'Faktura', onPress: () => openDocForm('invoice') },
      { text: 'Vognkort/Dokument', onPress: () => openDocForm('registration') },
      { text: 'Annet', onPress: () => openDocForm('other') },
      { text: 'Avbryt', style: 'cancel' },
    ]);
  };

  const pickDocImage = async (source: 'camera' | 'library') => {
    try {
      const options: any = {
        mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsMultipleSelection: source === 'library',
      };
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Tillatelse kreves', 'Kameratilgang kreves for å legge til dokument.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }
      if (!result.canceled && result.assets?.length) {
        const nextUris = result.assets.map((asset: any) => asset.uri).filter(Boolean);
        setDocImageUris(nextUris);
      }
    } catch (error) {
      console.warn('Doc image pick failed', error);
    }
  };

  const saveDocument = () => {
    const title = docTitle.trim() || DOC_TYPE_LABELS[docType];
    const note = docType === 'note' ? docNote.trim() : '';
    const expiry = docHasExpiry && docExpiry ? docExpiry.toISOString().slice(0, 10) : null;
    if (docType === 'note') {
      onAddDocument({
        title,
        type: docType,
        expiry,
        note: note || null,
        uri: null,
      });
    } else if (docImageUris.length > 1) {
      onAddDocument(
        docImageUris.map((uri) => ({
          title,
          type: docType,
          expiry,
          note: null,
          uri,
        }))
      );
    } else {
      onAddDocument({
        title,
        type: docType,
        expiry,
        note: note || null,
        uri: docImageUris[0] || null,
      });
    }
    setDocFormVisible(false);
    setShowDocDatePicker(false);
  };

  const handleDeleteDocument = (doc: Doc) => {
    Alert.alert('Slette dokument?', 'Dette kan ikke angres.', [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Slett', style: 'destructive', onPress: () => onDeleteDocument(doc) },
    ]);
  };

  const filteredDocs = useMemo(() => {
    const base = filterType === 'all' ? docs : docs.filter((d) => d.type === filterType);
    return [...base].sort((a, b) => String(a.type).localeCompare(String(b.type)));
  }, [docs, filterType]);

  const typeFilters: { key: DocType | 'all'; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'note', label: 'Notat' },
    { key: 'receipt', label: 'Kvittering' },
    { key: 'invoice', label: 'Faktura' },
    { key: 'registration', label: 'Vognkort/Dokument' },
    { key: 'other', label: 'Annet' },
  ];

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.screenContainer}>
        <View style={[styles.stickyHeader, { paddingTop: insets.top }]} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <View style={[styles.pageHeaderRow, { marginBottom: 4, paddingHorizontal: 20, paddingTop: 0, paddingBottom: 6 }]}>
            <View>
              <Text style={styles.pageTitle}>Dokumenter</Text>
              <Text style={styles.pageSub}>Hold dokumentene trygge og klare.</Text>
            </View>
            <TouchableOpacity
              style={[styles.headerIconBtnGhost, { backgroundColor: theme.primary, borderColor: theme.primary }]}
              onPress={openAddDocument}
            >
              <Feather name="plus" size={18} color={theme.onAccent} />
            </TouchableOpacity>
          </View>
        </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingTop: Math.max(0, headerHeight - 8), paddingHorizontal: 20 }}
      >
        {typeFilters.map((filter) => {
          const active = filterType === filter.key;
          const compact = filteredDocs.length === 0;
          return (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.docTypeChip,
                active && styles.docTypeChipActive,
                compact && { paddingHorizontal: 8, paddingVertical: 6 }
              ]}
              onPress={() => setFilterType(filter.key)}
            >
              <Text style={[styles.docTypeChipText, active && styles.docTypeChipTextActive, compact && { fontSize: 12 }]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

        <FlatList
          style={{ backgroundColor: theme.bg }}
          data={filteredDocs}
          extraData={themeKey}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => {
            const typeLabel = formatDocTypeLabel(item.type);
            const expiryText = item.expiry ? `Utløper: ${item.expiry}` : 'Ingen utløpsdato';
            return (
              <TouchableOpacity
                style={styles.docRow}
                onPress={() => setViewerDoc(item)}
                onLongPress={() => handleDeleteDocument(item)}
              >
                <View style={[styles.docIcon, { backgroundColor: theme.surface }]}>
                  <Feather name="file-text" size={20} color={theme.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{item.title}</Text>
                  <Text style={styles.docSub}>{typeLabel} · {expiryText}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.textDim} />
              </TouchableOpacity>
            );
          }}
        />

        <Modal visible={docFormVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalPopup}>
            <Text style={styles.popupTitle}>Nytt dokument</Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.inpLabel}>Tittel</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={theme.textDim}
                placeholder={DOC_TYPE_LABELS[docType]}
                value={docTitle}
                onChangeText={setDocTitle}
              />
            </View>
            {docType === 'note' && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inpLabel}>Notat</Text>
                <TextInput
                  style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
                  placeholderTextColor={theme.textDim}
                  placeholder="Skriv notatet her..."
                  value={docNote}
                  onChangeText={setDocNote}
                  multiline
                  autoCorrect
                />
              </View>
            )}
            {docType !== 'note' && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => pickDocImage('camera')}>
                  <Text style={styles.secondaryBtnText}>KAMERA</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => pickDocImage('library')}>
                  <Text style={styles.secondaryBtnText}>GALLERI</Text>
                </TouchableOpacity>
              </View>
            )}
            {docImageUris.length > 0 && (
              <>
                <ImageBackground
                  source={{ uri: docImageUris[0] }}
                  style={{ width: '100%', height: 160, borderRadius: 8, marginBottom: 8 }}
                  imageStyle={{ borderRadius: 8 }}
                />
                {docImageUris.length > 1 && (
                  <Text style={{ color: theme.textDim, fontSize: 12, textAlign: 'right', marginBottom: 4 }}>
                    {docImageUris.length} bilder valgt
                  </Text>
                )}
              </>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={styles.inpLabel}>Har utløpsdato?</Text>
              <Switch
                value={docHasExpiry}
                onValueChange={(val) => {
                  setDocHasExpiry(val);
                  if (!val) setDocExpiry(null);
                }}
                trackColor={{ false: theme.cardBorder, true: theme.primary }}
                thumbColor={theme.text}
              />
            </View>
            {docHasExpiry && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowDocDatePicker(true)}>
                <Text style={styles.secondaryBtnText}>
                  {docExpiry ? docExpiry.toLocaleDateString() : 'Velg dato'}
                </Text>
              </TouchableOpacity>
            )}
            {showDocDatePicker && (
              <DateTimePicker
                value={docExpiry || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(event, selectedDate) => {
                  if (Platform.OS !== 'ios') setShowDocDatePicker(false);
                  if (event.type === 'dismissed') return;
                  if (selectedDate) setDocExpiry(selectedDate);
                }}
              />
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setDocFormVisible(false);
                  setShowDocDatePicker(false);
                }}
                style={[styles.popupBtn, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.cardBorder }]}
              >
                <Text style={{ color: theme.text }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveDocument} style={[styles.popupBtn, { backgroundColor: theme.primary }]}>
                <Text style={{ fontWeight: '600', color: theme.onAccent }}>Lagre</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </Modal>

        <Modal visible={!!viewerDoc} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.docViewerCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.docViewerTitle}>{viewerDoc?.title}</Text>
              <TouchableOpacity onPress={() => { setViewerDoc(null); setViewerFullScreen(false); }}>
                <Feather name="x" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            {viewerDoc?.uri ? (
              <Pressable onPress={() => setViewerFullScreen(true)}>
                <ImageBackground
                  source={{ uri: viewerDoc.uri }}
                  style={{ width: '100%', height: 220, borderRadius: 8, marginBottom: 12 }}
                  imageStyle={{ borderRadius: 8 }}
                />
              </Pressable>
            ) : viewerDoc?.note ? (
              <Text style={styles.docViewerNote}>{viewerDoc.note}</Text>
            ) : (
              <Text style={styles.docViewerNote}>Ingen innhold tilgjengelig.</Text>
            )}
            {viewerDoc?.expiry ? (
              <Text style={styles.docSub}>Utløper: {viewerDoc.expiry}</Text>
            ) : null}
          </View>
        </View>
      </Modal>
      <Modal visible={viewerFullScreen} transparent animationType="fade">
        <Pressable style={styles.fullscreenOverlay} onPress={() => setViewerFullScreen(false)}>
          {viewerDoc?.uri ? (
            <ImageBackground
              source={{ uri: viewerDoc.uri }}
              style={{ width: '100%', height: '100%' }}
              imageStyle={{ resizeMode: 'contain' }}
            />
          ) : null}
        </Pressable>
      </Modal>
    </View>
    </TouchableWithoutFeedback>
  );
};

const TimelineScreen = ({
  logs,
  projects,
  onOpenLog,
  onEditLog,
  onDeleteLog,
  onOpenLogPhotos,
  logMedia,
  themeKey,
  units,
}: {
  logs: ServiceLog[];
  projects: Project[];
  onOpenLog: () => void;
  onEditLog: (log: ServiceLog) => void;
  onDeleteLog: (log: ServiceLog) => void;
  onOpenLogPhotos: (id: string) => void;
  logMedia: LogMedia[];
  themeKey: string;
  units: 'km' | 'mi';
}) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
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
  const globalLogs = logs.filter((l) => !l.projectId);
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.screenContainer}>
        <View style={[styles.stickyHeader, { paddingTop: insets.top }]} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <View style={[styles.pageHeaderRow, { marginBottom: 4, paddingHorizontal: 20, paddingTop: 0, paddingBottom: 6 }]}>
            <View>
              <Text style={styles.pageTitle}>SERVICELOGG</Text>
              <Text style={styles.pageSub}>Historikk og vedlikehold.</Text>
            </View>
            <TouchableOpacity style={styles.headerIconBtn} onPress={onOpenLog}>
              <Feather name="plus" size={20} color={theme.onAccent} />
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          style={{ backgroundColor: theme.bg }}
          data={globalLogs}
          extraData={themeKey}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ paddingTop: Math.max(0, headerHeight - 8), paddingBottom: 100, paddingHorizontal: 20 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>TIDSLOGG</Text>
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
    </TouchableWithoutFeedback>
  );
};

const ProjectsScreen = ({
  logs,
  projects,
  goals = [],
  activeProjectId,
  onStartProject,
  onAddLogToProject,
  onOpenProject,
  onSetActiveProject,
}: {
  logs: ServiceLog[];
  projects: Project[];
  goals: ProjectGoal[];
  activeProjectId: string | null;
  onStartProject: () => void;
  onAddLogToProject: (id: string) => void;
  onOpenProject: (id: string) => void;
  onSetActiveProject: (id: string | null) => void;
}) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const activeProjects = (projects || []).filter((p) => p.status !== 'done');
  const completedProjects = (projects || []).filter((p) => p.status === 'done');
  const goalList = goals || [];
  const statsForProject = (projectId: string) => {
    const projectLogs = logs.filter((l) => l.projectId === projectId);
    const totalCost = projectLogs.reduce((sum, item) => sum + (item.cost || 0), 0);
    return { count: projectLogs.length, cost: totalCost };
  };
  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) || null : null;
  const goalsForProject = (projectId: string) => goalList.filter((g) => g.projectId === projectId);
  const nextGoalForProject = (projectId: string) =>
    goalsForProject(projectId).find((g) => g.status !== 'done') || null;
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[styles.stickyHeader, { paddingTop: insets.top }]} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <View style={[styles.pageHeaderRow, { alignItems: 'center', marginBottom: 4, paddingHorizontal: 20, paddingTop: 0, paddingBottom: 6 }]}>
          <View>
            <Text style={styles.pageTitle}>Prosjekter</Text>
            <Text style={styles.pageSub}>Samle arbeid i fokuserte prosjekter.</Text>
          </View>
          <TouchableOpacity style={[styles.headerIconBtnGhost, { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={onStartProject}>
            <Feather name="plus" size={18} color={theme.onAccent} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20, paddingTop: Math.max(0, headerHeight - 8) }}
      >

      {activeProject && (
        <TouchableOpacity style={styles.activeProjectCard} onPress={() => onOpenProject(activeProject.id)}>
          <View style={styles.activeProjectTopRow}>
            <View>
              <Text style={styles.activeProjectLabel}>Aktivt prosjekt</Text>
              <Text style={styles.pageTitleSmall}>{activeProject.title}</Text>
              <Text style={styles.projectMeta}>
                {formatProjectStatusLabel(activeProject.status)} · {new Date(activeProject.updatedAt).toLocaleDateString()}
              </Text>
            </View>
          </View>
          {activeProject.budgetPlanned && activeProject.budgetPlanned > 0 ? (
            <View style={styles.budgetBarWrap}>
              <View style={styles.budgetBarTrack}>
                <View
                  style={[
                    styles.budgetBarFill,
                    {
                      width: `${Math.min(
                        (statsForProject(activeProject.id).cost / activeProject.budgetPlanned) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.projectMeta}>
                {statsForProject(activeProject.id).cost} kr av {activeProject.budgetPlanned} kr
              </Text>
            </View>
          ) : null}
          {nextGoalForProject(activeProject.id) ? (
            <Text style={styles.activeProjectGoal}>
              Neste mål: {nextGoalForProject(activeProject.id)!.title}
            </Text>
          ) : (
            <Text style={styles.activeProjectGoalEmpty}>Ingen mål lagt til ennå.</Text>
          )}
          <View style={styles.activeProjectActions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 3, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => onAddLogToProject(activeProject.id)}
            >
              <Text style={[styles.btnTxt, { color: theme.onAccent, letterSpacing: 0.6 }]}>LEGG TIL LOGG</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { flex: 1, paddingVertical: 12, borderColor: theme.danger, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => onSetActiveProject(null)}
            >
              <Text style={[styles.secondaryBtnText, { fontWeight: '800', color: theme.danger, letterSpacing: 0.4, textAlign: 'center' }]}>
                FJERN AKTIV
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {(activeProjects.length === 0 && completedProjects.length === 0) && (
        <View style={styles.projectListItem}>
          <Text style={styles.pageTitleSmall}>Ingen prosjekter ennå</Text>
          <Text style={styles.projectMeta}>Opprett et for å spore relatert arbeid.</Text>
        </View>
      )}

      {activeProjects.map((item) => {
        const stats = statsForProject(item.id);
        const statusTone = item.status === 'done' ? theme.success : theme.primary;
        const isActive = activeProjectId === item.id;
        const badgeLabel = isActive
          ? 'AKTIV'
          : item.status === 'active'
            ? 'PÅGÅR'
            : formatProjectStatusLabel(item.status).toUpperCase();
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onOpenProject(item.id)}
            style={styles.folderCard}>
            <View style={styles.projectRow}>
              <View style={[styles.projectStatusStrip, { backgroundColor: statusTone }]} />
              <View style={styles.projectContent}>
                <View style={styles.projectTopRow}>
                  <Text style={styles.pageTitleSmall}>{item.title}</Text>
                  <View style={styles.projectTopMeta}>
                    <Text style={styles.projectMeta}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
                    <TouchableOpacity
                      style={styles.projectStarBtn}
                      onPress={() => onSetActiveProject(isActive ? null : item.id)}
                    >
                      {isActive ? (
                        <Feather name="star" size={16} color={theme.warning} />
                      ) : (
                        <Feather name="star" size={16} color={theme.textDim} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.projectBottomRow}>
                  <View>
                    <Text style={styles.projectStats}>
                      {stats.count ? `${stats.count} logger` : 'Ingen logger ennå'}
                    </Text>
                    <Text style={styles.projectStats}>{stats.cost} kr</Text>
                  </View>
                  <Text style={styles.projectBadge}>{badgeLabel}</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {!!completedProjects.length && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>FULLFØRT</Text>
          {completedProjects.map((item) => {
            const stats = statsForProject(item.id);
            const statusTone = item.status === 'done' ? theme.success : theme.primary;
            const isActive = activeProjectId === item.id;
            const badgeLabel = isActive
              ? 'AKTIV'
              : item.status === 'active'
                ? 'PÅGÅR'
                : formatProjectStatusLabel(item.status).toUpperCase();
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => onOpenProject(item.id)}
                style={styles.folderCard}>
              <View style={styles.projectRow}>
                  <View style={[styles.projectStatusStrip, { backgroundColor: statusTone }]} />
                  <View style={styles.projectContent}>
                    <View style={styles.projectTopRow}>
                      <Text style={styles.pageTitleSmall}>{item.title}</Text>
                      <View style={styles.projectTopMeta}>
                        <Text style={styles.projectMeta}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
                        <TouchableOpacity
                          style={styles.projectStarBtn}
                          onPress={() => onSetActiveProject(isActive ? null : item.id)}
                        >
                          {isActive ? (
                            <Feather name="star" size={16} color={theme.warning} />
                          ) : (
                            <Feather name="star" size={16} color={theme.textDim} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.projectBottomRow}>
                      <View>
                        <Text style={styles.projectStats}>
                        {stats.count ? `${stats.count} logger` : 'Ingen logger ennå'}
                      </Text>
                      <Text style={styles.projectStats}>{stats.cost} kr</Text>
                      </View>
                      <Text style={styles.projectBadge}>{badgeLabel}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
    </View>
  );
};

const ConfigScreen = ({
  car,
  onDelete,
  onChangeCar,
  units,
  appTheme,
  onChangeUnits,
  onChangeAppTheme,
  onOpenAppearance,
  onEditNickname,
  onSignOut,
  onClose,
  username,
  onShowCopyMenu,
}: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const safeCar = car ?? {};
  const [showVinFull, setShowVinFull] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.pageHeaderRow, { paddingHorizontal: 0 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onClose}>
            <Feather name="chevron-left" size={20} color={theme.onAccent} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.pageTitle}>Innstillinger</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.settingsHeader}>KJØRETØY</Text>
    <View style={styles.settingsGroup}>
      {Platform.OS === 'ios' ? (
        <View style={styles.settingsRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="hash" size={16} color={theme.textDim} />
            <Text style={styles.settingsLabel}>Registreringsnummer</Text>
          </View>
          <Text style={[styles.settingsValue, { fontFamily: Fonts.mono }]} selectable>{safeCar.plate}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.settingsRow} onPress={(e) => onShowCopyMenu?.(safeCar.plate || '', e)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="hash" size={16} color={theme.textDim} />
            <Text style={styles.settingsLabel}>Registreringsnummer</Text>
          </View>
          <Text style={[styles.settingsValue, { fontFamily: Fonts.mono }]}>{safeCar.plate}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsRow} onPress={onEditNickname}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="user" size={16} color={theme.textDim} />
          <Text style={styles.settingsLabel}>Kallenavn</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.settingsValue, !safeCar.nickname && { color: theme.textDim }]}>
            {safeCar.nickname || 'Legg til kallenavn'}
          </Text>
          <Feather name="edit-2" size={16} color={theme.textDim} />
        </View>
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <TouchableOpacity
        style={[styles.settingsRow, showVinFull && { alignItems: 'flex-start' }]}
        onPress={() => setShowVinFull((prev) => !prev)}
      >
        {!showVinFull ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="key" size={16} color={theme.textDim} />
              <Text style={styles.settingsLabel}>Understellsnummer</Text>
            </View>
            <Text
              style={[
                styles.settingsValue,
                { fontFamily: Fonts.mono, flexShrink: 1, textAlign: 'right', fontSize: 14, marginLeft: 12 },
              ]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {safeCar.vin}
            </Text>
          </>
        ) : (
          <>
            <Text
              style={[styles.settingsValue, { fontFamily: Fonts.mono, flex: 1, width: '100%', textAlign: 'left', fontSize: 14 }]}
            >
              {safeCar.vin}
            </Text>
            <TouchableOpacity
              onPress={() => copyToClipboard(safeCar.vin)}
              style={{
                position: 'absolute',
                right: 12,
                bottom: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.cardBorder,
              }}
            >
              <Text style={{ color: theme.textDim, fontWeight: '700', fontSize: 12 }}>Kopier</Text>
            </TouchableOpacity>
          </>
        )}
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsRow} onPress={onChangeCar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="repeat" size={16} color={theme.textDim} />
          <Text style={styles.settingsLabel}>Bytt bil</Text>
        </View>
        <Feather name="chevron-right" size={18} color={theme.textDim} />
      </TouchableOpacity>
    </View>

    <Text style={styles.settingsHeader}>Enheter</Text>
    <View style={styles.settingsGroup}>
      <View style={styles.settingsChoiceRow}>
        <Text style={styles.settingsChoiceLabel}>Metrisk / Imperial</Text>
        <Switch
          value={units === 'mi'}
          onValueChange={(val) => onChangeUnits(val ? 'mi' : 'km')}
          trackColor={{ false: theme.cardBorder, true: theme.primary }}
          thumbColor={theme.text}
        />
      </View>
    </View>

    <Text style={styles.settingsHeader}>Tema</Text>
    <View style={styles.settingsGroup}>
      <TouchableOpacity style={styles.settingsRow} onPress={onOpenAppearance}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="sliders" size={16} color={theme.textDim} />
          <Text style={styles.settingsLabel}>Apputseende</Text>
        </View>
        <Feather name="chevron-right" size={18} color={theme.textDim} />
      </TouchableOpacity>
    </View>

    <Text style={styles.settingsHeader}>Konto</Text>
    <View style={styles.settingsGroup}>
      <View style={styles.settingsRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="user" size={16} color={theme.textDim} />
          <Text style={styles.settingsLabel}>Brukernavn</Text>
        </View>
        <Text style={styles.settingsValue}>{username || '—'}</Text>
      </View>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsRow} onPress={onSignOut}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="log-out" size={16} color={theme.textDim} />
          <Text style={styles.settingsLabel}>Logg ut</Text>
        </View>
      </TouchableOpacity>
    </View>

    <View style={{ marginTop: 12 }}>
      <TouchableOpacity style={styles.secondaryBtn} onPress={onChangeCar}>
        <Text style={styles.secondaryBtnText}>BYTT BIL</Text>
      </TouchableOpacity>
    </View>
    <View style={{ marginTop: 12 }}>
      <TouchableOpacity style={styles.scrapBtn} onPress={onDelete}>
        <Text style={styles.scrapBtnText}>VRAK BILEN</Text>
      </TouchableOpacity>
    </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// --- COMPONENTS ---



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
            <Feather name="x" size={22} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontWeight: '600' }}>
            {index + 1} / {media.length}
          </Text>
          {onDelete ? (
            <TouchableOpacity onPress={() => onDelete(media[index]?.id)}>
              <Feather name="trash-2" size={20} color="white" />
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
            <Feather name="x" size={22} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontWeight: '600' }}>Bilder</Text>
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
  const [budget, setBudget] = useState(project?.budgetPlanned ? formatNumberWithSpaces(String(project.budgetPlanned)) : '');

  useEffect(() => {
    setTitle(project?.title || '');
    setDescription(project?.description || '');
    setBudget(project?.budgetPlanned ? formatNumberWithSpaces(String(project.budgetPlanned)) : '');
  }, [project]);

  if (!visible) return null;

  return (
    <View style={[styles.modalBase, { backgroundColor: theme.bg }]}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.modalCancelText}>Avbryt</Text>
        </TouchableOpacity>
        <Text style={styles.modalH1}>{project?.id ? 'Rediger prosjekt' : 'Nytt prosjekt'}</Text>
        <TouchableOpacity
          onPress={() =>
            onSave({
              title,
              description,
              budgetPlanned: budget ? parseNumberWithSpaces(budget) : null
            })
          }>
          <Text style={styles.modalSaveText}>Lagre</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.logForm}>
        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Detaljer</Text>
          <Text style={{ color: theme.textDim, fontSize: 12, marginTop: -2, marginBottom: 8 }}>
            Dette kan endres senere.
          </Text>
          <View style={styles.listGroup}>
            <View style={[styles.listRow, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
              <Text style={styles.listLabel}>Tittel</Text>
              <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[styles.listInput, { fontSize: 18, textAlign: 'left', flex: 1 }]}
                  placeholder="Motoroverhaling"
                  placeholderTextColor={theme.textDim}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={30}
                />
                <Text style={{ color: theme.textDim, fontSize: 12, minWidth: 36, textAlign: 'right' }}>
                  {title.length}/30
                </Text>
              </View>
            </View>
            <View style={styles.listDivider} />
            <View style={[styles.listRow, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
              <Text style={styles.listLabel}>Beskrivelse</Text>
              <TextInput
                style={[styles.listInput, { fontSize: 18, textAlign: 'left' }]}
                placeholder="Valgfritt"
                placeholderTextColor={theme.textDim}
                value={description}
                onChangeText={setDescription}
              />
            </View>
            <View style={styles.listDivider} />
            <View style={[styles.listRow, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
              <Text style={styles.listLabel}>Planlagt</Text>
              <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                <TextInput
                  style={[styles.listInput, { flex: 1, textAlign: 'left' }]}
                  placeholder="0"
                  placeholderTextColor={theme.textDim}
                  keyboardType="numeric"
                  value={budget}
                  onChangeText={(val) => setBudget(formatNumberWithSpaces(val))}
                />
                <Text style={[styles.listLabel, { width: 24, textAlign: 'right' }]}>kr</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
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
            <Feather name="x" size={22} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontWeight: '600' }}>Prosjektbilder</Text>
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
    const actions = ['Rediger', 'Slett', 'Avbryt'];
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
    Alert.alert('Loggoppføring', 'Velg en handling', [
      { text: 'Rediger', onPress: () => onEdit?.(log) },
      { text: 'Slett', style: 'destructive', onPress: () => onDelete?.(log) },
      { text: 'Avbryt', style: 'cancel' }
    ]);
  };
  const formatDistance = (km: number) =>
    units === 'mi' ? `${Math.round(km * 0.621371)} mi` : `${km} km`;
  const date = new Date(log.date);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('nb-NO', { month: 'short' }).toUpperCase();
  const iconName = getTypeIconName(log.type);

  return (
    <Pressable onLongPress={openActions} onPress={() => (photoCount ? onOpenPhotos?.() : undefined)}>
      <View style={{ position: 'relative' }}>
        <View style={styles.timelineLine} />
        <View style={styles.timelineRow}>
          <View style={styles.timelineDate}>
            <Text style={styles.timelineDay}>{day}</Text>
            <Text style={styles.timelineMonth}>{month}</Text>
          </View>
          <View style={styles.timelineCard}>
            <View style={styles.timelineHeader}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name={iconName} size={16} color={theme.text} />
                <Text style={styles.timelineTitle}>{log.title}</Text>
              </View>
              <Text style={styles.timelineMeta}>{log.mileage > 0 ? formatDistance(log.mileage, units) : ''}</Text>
            </View>
            {!!log.notes && <Text style={styles.logNotes}>{log.notes}</Text>}
            <View style={styles.timelineMetaRow}>
              <Text style={styles.timelineMeta}>{projectName || '—'}</Text>
              {log.cost > 0 && <Text style={styles.timelineMeta}>{log.cost} kr</Text>}
            </View>
            {!!photoCount && (
              <View style={[styles.projectPill, { borderColor: theme.cardBorder, backgroundColor: theme.surface, marginTop: 8 }]}>
                <Feather name="image" size={12} color={theme.textDim} />
                <Text style={[styles.logMeta, { color: theme.textDim }]}>{photoCount} bilde{photoCount > 1 ? 'r' : ''}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const TabBtn = ({ iconName, label, active, onPress }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity style={styles.tabBtn} onPress={onPress} accessibilityLabel={label}>
      <Feather name={iconName} size={22} color={active ? theme.primary : theme.textDim} />
      <Text style={[styles.tabLabel, { color: active ? theme.primary : theme.textDim }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const getTypeIconName = (type: string): any => {
  const key = String(type || '').toLowerCase();
  const map: Record<string, any> = {
    service: 'tool',
    repair: 'tool',
    inspection: 'eye',
    parts: 'zap',
    upgrade: 'zap',
    tires: 'disc',
    fuel: 'droplet',
    other: 'file-text',
  };
  return map[key] || 'file-text';
};

// --- MODALS ---

const AddLogModal = ({
  onClose,
  onSave,
  mileagePlaceholder,
  logTypes,
  logType,
  onSetLogType,
  onManageTypes,
  units,
  initialLog,
  projects,
  selectedProjectId,
  onSelectProject,
  onRequestNewProject,
  initialMediaUris,
  formSeed,
  currentMileage
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
  const titleRef = useRef<TextInput>(null);
  const costRef = useRef<TextInput>(null);
  const mileageRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const prevSeedRef = useRef<number | null>(null);
  const prevLogIdRef = useRef<string | null>(null);
  const formatLogDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const typeLabel = (value: LogType) => formatLogTypeLabel(value);
  const typeOptions: LogType[] = ['service', 'repair', 'inspection', 'parts', 'tires', 'other'];

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
    setCost(initialLog.cost ? formatNumberWithSpaces(String(initialLog.cost)) : '');
    const displayMileage =
      typeof initialLog.mileage === 'number'
        ? units === 'mi'
          ? Math.round(initialLog.mileage * 0.621371)
          : initialLog.mileage
        : '';
    setMileage(displayMileage ? formatNumberWithSpaces(String(displayMileage)) : '');
    setNotes(initialLog.notes || '');
    setLogDate(initialLog.date ? new Date(initialLog.date) : new Date());
    setProjectId(initialLog.projectId || null);
    setPhotos(initialMediaUris || []);
  }, [formSeed, initialLog, units, initialMediaUris, selectedProjectId]);

  const projectLabel = () => {
    if (!projectId) return 'Ingen';
    const match = projects?.find((p: Project) => p.id === projectId);
    return match?.title || 'Prosjekt';
  };

  const pickPhotos = async (source: 'camera' | 'library') => {
    try {
      const options: any = {
        mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsMultipleSelection: source === 'library',
      };
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Tillatelse kreves', 'Kameratilgang kreves for å legge til bilder.');
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
          <Text style={styles.modalCancelText}>Avbryt</Text>
        </TouchableOpacity>
        <Text style={styles.modalH1}>{initialLog ? 'Rediger logg' : 'Ny logg'}</Text>
        <TouchableOpacity
            onPress={() => {
              onSelectProject?.(projectId || null);
              onSave(
                {
                  id: initialLog?.id || Date.now().toString(),
                  title: title || typeLabel(logType),
                  cost: parseNumberWithSpaces(cost),
                  mileage: toKilometers(parseNumberWithSpaces(mileage), units),
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
          <Text style={styles.modalSaveText}>Lagre</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={styles.logForm}
        enableOnAndroid
        extraScrollHeight={140}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Detaljer</Text>
          <View style={styles.listGroup}>
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Tittel</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <TextInput
                  ref={titleRef}
                  style={styles.listInput}
                  placeholderTextColor={theme.textDim}
                  placeholder="Oljeskift"
                  value={title}
                  onChangeText={setTitle}
                  maxLength={40}
                  returnKeyType="next"
                  onSubmitEditing={() => costRef.current?.focus()}
                />
                <Text style={{ color: theme.textDim, fontSize: 12, minWidth: 36, textAlign: 'right' }}>
                  {title.length}/40
                </Text>
              </View>
            </View>
            <View style={styles.listDivider} />
            <TouchableOpacity
              style={styles.listRow}
              onPress={() => setShowDatePicker(!showDatePicker)}>
              <Text style={styles.listLabel}>Dato</Text>
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
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Prosjekt</Text>
              <View style={[styles.listValueRow, { flex: 1, justifyContent: 'flex-end' }]}>
                <Text style={styles.listValue}>{projectLabel()}</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              contentContainerStyle={{ gap: 8, paddingVertical: 10, paddingLeft: 4, paddingRight: 4 }}
              showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => setProjectId(null)}
                style={[
                  styles.chip,
                  { backgroundColor: projectId ? theme.surface : theme.primary, borderColor: theme.cardBorder }
                ]}>
                <Text style={{ color: projectId ? theme.text : 'white', fontWeight: '600' }}>Ingen</Text>
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
                <Text style={{ color: theme.primary, fontWeight: '700' }}>+ Nytt</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Type</Text>
          <View style={styles.typeGrid}>
            {typeOptions.map((type) => {
              const iconName = getTypeIconName(type);
              const isActive = logType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeButton, isActive && styles.typeButtonActive]}
                  onPress={() => onSetLogType?.(type)}
                >
                  <Feather name={iconName} size={20} color={isActive ? theme.onAccent : theme.textDim} />
                  <Text style={[styles.typeButtonText, isActive && styles.typeButtonTextActive]}>
                    {typeLabel(type)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Bilder</Text>
          <View style={[styles.listGroup, { padding: 12, gap: 10 }]}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, borderColor: theme.cardBorder }]} onPress={() => pickPhotos('camera')}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="camera" size={18} color={theme.text} />
                  <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '700' }}>KAMERA</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, borderColor: theme.cardBorder }]} onPress={() => pickPhotos('library')}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="image" size={18} color={theme.text} />
                  <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '700' }}>GALLERI</Text>
                </View>
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
              {!photos.length && <Text style={{ color: theme.textDim }}>Ingen bilder lagt til.</Text>}
            </ScrollView>
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Tall</Text>
          <View style={styles.listGroup}>
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Kostnad</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <TextInput
                  ref={costRef}
                  style={[styles.listInput, { fontFamily: Fonts.mono }]}
                  placeholderTextColor={theme.textDim}
                  placeholder="0"
                  keyboardType="numeric"
                  value={cost}
                  onChangeText={(val) => setCost(formatNumberWithSpaces(val))}
                  returnKeyType="next"
                  onSubmitEditing={() => mileageRef.current?.focus()}
                />
                <Text style={[styles.listLabel, { minWidth: 22, textAlign: 'right' }]}>kr</Text>
              </View>
            </View>
            <View style={styles.quickAddRow}>
              {[10, 100, 1000].map((val) => (
                <TouchableOpacity
                  key={`pos-cost-${val}`}
                  style={[styles.quickAddBtn, styles.quickAddBtnPositive]}
                  onPress={() => {
                    const base = cost ? parseNumberWithSpaces(cost) : 0;
                    const next = Math.max(0, base + val);
                    setCost(formatNumberWithSpaces(String(next)));
                  }}
                >
                  <Text style={[styles.quickAddText, styles.quickAddTextPositive]}>+{val}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.quickAddRow}>
              {[-10, -100, -1000].map((val) => (
                <TouchableOpacity
                  key={`neg-cost-${val}`}
                  style={[styles.quickAddBtn, styles.quickAddBtnNegative]}
                  onPress={() => {
                    const base = cost ? parseNumberWithSpaces(cost) : 0;
                    const next = Math.max(0, base + val);
                    setCost(formatNumberWithSpaces(String(next)));
                  }}
                >
                  <Text style={[styles.quickAddText, styles.quickAddTextNegative]}>{val}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.listDivider} />
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Kilometerstand</Text>
              <TextInput
                ref={mileageRef}
                style={[styles.listInput, { fontFamily: Fonts.mono }]}
                placeholderTextColor={theme.textDim}
                placeholder={mileagePlaceholder}
                keyboardType="numeric"
                value={mileage}
                onChangeText={(val) => setMileage(formatNumberWithSpaces(val))}
                returnKeyType="next"
                onSubmitEditing={() => notesRef.current?.focus()}
              />
            </View>
            <View style={styles.quickAddRow}>
              {[1000, 5000, 10000].map((val) => (
                <TouchableOpacity
                  key={`pos-mile-${val}`}
                  style={[styles.quickAddBtn, styles.quickAddBtnPositive]}
                  onPress={() => {
                    const base = mileage ? parseNumberWithSpaces(mileage) : currentMileage || 0;
                    setMileage(formatNumberWithSpaces(String(base + val)));
                  }}
                >
                  <Text style={[styles.quickAddText, styles.quickAddTextPositive]}>+{val / 1000}k</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.quickAddRow}>
              {[-1000, -5000, -10000].map((val) => (
                <TouchableOpacity
                  key={`neg-mile-${val}`}
                  style={[styles.quickAddBtn, styles.quickAddBtnNegative]}
                  onPress={() => {
                    const base = mileage ? parseNumberWithSpaces(mileage) : currentMileage || 0;
                    setMileage(formatNumberWithSpaces(String(base + val)));
                  }}
                >
                  <Text style={[styles.quickAddText, styles.quickAddTextNegative]}>{val / 1000}k</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Notater</Text>
          <View style={styles.listGroup}>
            <TextInput
              ref={notesRef}
              style={styles.notesInput}
              placeholderTextColor={theme.textDim}
              placeholder="Detaljer..."
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={200}
              autoCorrect
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <View style={{ alignItems: 'flex-end', paddingHorizontal: 12, paddingBottom: 8 }}>
              <Text style={{ color: theme.textDim, fontSize: 12 }}>{notes.length}/200</Text>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

const SimpleInputModal = ({ visible, title, placeholder, keyboard, onClose, onSave, units }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const [val, setVal] = useState('');
  useEffect(() => setVal(''), [visible]);
  const handleChange = (next: string) => {
    if (keyboard === 'numeric') {
      setVal(formatNumberWithSpaces(next));
      return;
    }
    setVal(next);
  };
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
            onChangeText={handleChange} 
            keyboardType={keyboard}
            autoFocus
          />
          {units && <Text style={styles.popupHelp}>Enhet: {units.toUpperCase()}</Text>}
          <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
            <TouchableOpacity onPress={onClose} style={[styles.popupBtn, {backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.cardBorder}]}><Text style={{color: theme.text}}>Avbryt</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => onSave(val)} style={[styles.popupBtn, {backgroundColor: theme.primary}]}><Text style={{fontWeight: '600', color: theme.onAccent}}>Lagre</Text></TouchableOpacity>
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
      Alert.prompt('Ny type', 'Gi typen et navn', [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Legg til',
          onPress: (value) => onAddType(String(value || ''))
        }
      ]);
      return;
    }

    Alert.alert('Ny type', 'Skriv inn typenavn:', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Legg til',
        onPress: () => {}
      }
    ]);
  };

  return (
    <View style={[styles.modalBase, { backgroundColor: theme.bg }]}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.modalCancelText}>Ferdig</Text>
        </TouchableOpacity>
        <Text style={styles.modalH1}>Administrer typer</Text>
        <TouchableOpacity style={styles.headerIconBtn} onPress={promptAddType}>
          <Feather name="plus" size={20} color={theme.onAccent} />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.logForm}>
        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Dine typer</Text>
          <View style={styles.listGroup}>
            {types.map((type: string, index: number) => (
              <View key={type}>
                <Swipeable
                  renderRightActions={() => (
                    <TouchableOpacity style={styles.swipeDelete} onPress={() => onRemoveType(type)}>
                      <Feather name="trash-2" size={18} color="white" />
                    </TouchableOpacity>
                  )}>
                  <View style={styles.listRow}>
                    <TouchableOpacity style={styles.typeSelectBtn} onPress={() => onSelectType(type)}>
                      <View style={styles.typeNameRow}>
                        {(() => {
                          const iconName = getTypeIconName(type);
                          return <Feather name={iconName} size={16} color={theme.textDim} />;
                        })()}
                        <Text style={styles.typeName}>{formatLogTypeLabel(type)}</Text>
                      </View>
                      {selectedType === type && (
                        <Feather name="check" size={18} color={theme.primary} />
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

const Onboarding = ({ onRegister, cars, userEmail, onSelectCar }: any) => {
  const { theme, statusBarStyle } = useTheme();
  const styles = useStyles();
  const emailLabel = userEmail ? `Innlogget som ${userEmail}` : null;
  const [plate, setPlate] = useState('');
  const [load, setLoad] = useState(false);
  const [showAddCar, setShowAddCar] = useState(false);
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
            <Feather name="truck" size={32} color={theme.primary} />
          </View>
          <Text style={styles.onboardingTitle}>MIN GARASJE</Text>
          <Text style={styles.onboardingSub}>Presisjonsverktøy for servicehistorikk.</Text>
          {!!emailLabel && <Text style={styles.onboardingSub}>{emailLabel}</Text>}
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
                            <View style={{ width: '100%', height: '100%', opacity: 0.6 }}>
                              <BrandLogo width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
                            </View>
                          ) : (
                            <Feather name="truck" size={18} color={theme.textDim} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.onboardingRowTitle}>{item.nickname || `${item.make} ${item.model}`}</Text>
                          <Text style={styles.onboardingRowSub}>{String(item.plate || '').replace(/\s+/g, '')}</Text>
                        </View>
                        <Feather name="chevron-right" size={18} color={theme.textDim} />
                      </TouchableOpacity>
                      {index < cars.length - 1 && <View style={styles.onboardingDivider} />}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
          <View style={styles.onboardingDividerLine} />
          {showAddCar && (
            <View style={{ width: '100%' }}>
              <View style={styles.plateWrap}>
                <View style={styles.plateStrip}>
                  <Text style={styles.plateStripText}>N</Text>
                </View>
                <TextInput
                  style={styles.plateInput}
                  placeholder="REG.NR"
                  placeholderTextColor="#6B7280"
                  value={plate}
                  onChangeText={(val) => {
                    const cleaned = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    setPlate(/[A-Z]/.test(cleaned) ? cleaned : formatNumberWithSpaces(cleaned));
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <TouchableOpacity 
                style={[
                  styles.mainBtn,
                  styles.onboardingBtn,
                  { marginTop: 12, width: '100%', height: 56, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center' }
                ]} 
                onPress={() => { setLoad(true); onRegister(plate).finally(() => setLoad(false)); }}
              >
                {load ? <ActivityIndicator color="white" /> : <Text style={styles.btnTxt}>START</Text>}
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={styles.addCarLink}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowAddCar((prev) => !prev);
            }}
          >
            <Text style={styles.addCarLinkText}>{showAddCar ? 'FERDIG' : 'LEGG TIL BIL'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};
