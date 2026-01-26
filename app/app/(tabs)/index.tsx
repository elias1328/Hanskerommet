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
  useColorScheme,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Animated,
  LayoutAnimation,
  UIManager,
  ImageBackground,
  Dimensions,
  Keyboard
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; // Ensure you have expo-linear-gradient installed, or remove if standard Expo
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
import { DARK_THEME, LIGHT_THEME, ThemeContext, StylesContext, useTheme, useStyles, createStyles } from '@/components/garage/theme';
import { ProjectDetailModal, GoalFormModal } from '@/components/garage/project-detail-modal';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

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
  { id: '1', title: 'Forsikringspolise', expiry: '2025-01-01', type: 'insurance' },
  { id: '2', title: 'Vognkort (Del 2)', expiry: 'Aldri', type: 'vognkort' }
];

const LOG_TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  repair: 'Reparasjon',
  inspection: 'Kontroll',
  upgrade: 'Oppgradering',
  fuel: 'Drivstoff',
};

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

export default function App() {
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
    username: false,
    goalForm: false,
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
            expiry: row.expiry,
            type: row.type
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
              expiry: row.expiry,
              type: row.type
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
      const data = await fetchCarDetails(plate);
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

    if (editingGoal?.id) {
      const { data: goalRow, error } = await supabase
        .from('project_goals')
        .update({
          title: cleanTitle,
          notes: input.notes ?? null,
          due_date: input.dueDate ?? null,
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
        due_date: input.dueDate ?? null,
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
                  <VaultScreen docs={docs} themeKey={resolvedTheme} />
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
                    onEditNickname={() => setModals((prev) => ({ ...prev, nickname: true }))}
                    onSignOut={handleSignOut}
                    onClose={closeSettings}
                    username={username}
                  />
                </Animated.View>
              )}

              {/* --- CUSTOM TAB BAR (Perfectly Centered FAB) --- */}
              <View style={[styles.tabBarContainer, { height: 49 + insets.bottom }]}>
                <BlurView intensity={50} tint={theme.blurTint} style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
                  <View style={styles.tabBarContent}>
                    <TabBtn icon="car-sport" label="Garasje" active={view === 'garage'} onPress={() => navigateTo('garage')} />
                    <TabBtn icon="document-text" label="Logger" active={view === 'logs'} onPress={() => navigateTo('logs')} />
                    <TabBtn icon="layers" label="Prosjekter" active={view === 'projects'} onPress={() => navigateTo('projects')} />
                    <TabBtn icon="file-tray-full" label="Dokumenter" active={view === 'vault'} onPress={() => navigateTo('vault')} />
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
                          category: (proj.category || '').trim() || null,
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
                        category: (proj.category || '').trim() || null,
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
          onSave={(val) => void handleUpdateMileage(toKilometers(parseInt(val) || 0, units))}
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

// --- SCREENS ---

const GarageScreen = ({ car, logs, onOpenLog, onOpenMileage, onViewAllLogs, onEditLog, onDeleteLog, onOpenLogPhotos, units, projects, logMedia, onOpenSettings }: any) => {
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
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Hanskerommet
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.headerPill} onPress={onOpenLog}>
            <Ionicons name="add" size={16} color="white" />
            <Text style={styles.headerPillText}>Hurtiglogg</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerIconBtnGhost, { marginLeft: 8 }]} onPress={onOpenSettings}>
          <Ionicons name="settings" size={20} color={theme.textDim} />
        </TouchableOpacity>
        </View>
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
            label="Kilometerstand"
            value={formatDistance(safeCar.mileage, units)}
            sub="Trykk for å oppdatere"
            tone={theme.primary}
            icon="speedometer"
            onPress={onOpenMileage}
          />
          <InfoTile
            label="EU-kontroll"
            value={daysToEu < 0 ? 'Forfalt' : `${daysToEu} dager`}
            sub={nextEuRaw || 'Ikke tilgjengelig'}
            tone={theme[euStatus]}
            icon="calendar"
          />
          <InfoTile
            label="Totalkostnad"
            value={`${logs.reduce((a:any,b:any)=>a+b.cost,0)} kr`}
            sub="Totalt"
            tone={theme.accent}
            icon="wallet"
          />
          <InfoTile
            label="Siste utgift"
            value={`${lastExpense} kr`}
            sub="Nyeste"
            tone={theme.success}
            icon="cash"
          />
        </View>
      </View>

      {/* Recent History */}
      <View style={styles.section}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
          <Text style={styles.sectionTitle}>SISTE AKTIVITET</Text>
          <TouchableOpacity onPress={onViewAllLogs}><Text style={{color: theme.primary, fontWeight: '600'}}>Vis alle</Text></TouchableOpacity>
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
        <Text style={styles.pageTitle}>Dokumenter</Text>
        <Text style={styles.pageSub}>Hold dokumentene trygge og klare.</Text>
      </View>
      <TouchableOpacity
        style={styles.headerIconBtn}
        onPress={() => Alert.alert("Demo", "Kameraskanner ville åpnet her.")}>
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
            <Text style={styles.docSub}>Utløper: {item.expiry}</Text>
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
    <View style={styles.screenContainer}>
      <FlatList
        style={{ backgroundColor: theme.bg }}
        data={globalLogs}
        extraData={themeKey}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            <View style={styles.pageHeaderRow}>
              <View>
                <Text style={styles.pageTitle}>Servicelog</Text>
                <Text style={styles.pageSub}>Følg vedlikehold og utgifter.</Text>
              </View>
              <TouchableOpacity style={styles.headerIconBtn} onPress={onOpenLog}>
                <Ionicons name="add" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>GLOBALE LOGGER</Text>
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
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20, paddingTop: 20 }}
    >
      <View style={styles.pageHeaderRow}>
        <View>
          <Text style={styles.pageTitle}>Prosjekter</Text>
          <Text style={styles.pageSub}>Samle arbeid i fokuserte prosjekter.</Text>
        </View>
        <TouchableOpacity style={styles.headerIconBtn} onPress={onStartProject}>
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      {activeProject && (
        <View style={styles.activeProjectCard}>
          <View style={styles.activeProjectTopRow}>
            <View>
              <Text style={styles.activeProjectLabel}>Aktivt prosjekt</Text>
              <Text style={styles.pageTitleSmall}>{activeProject.title}</Text>
              <Text style={styles.projectMeta}>
                {formatProjectStatusLabel(activeProject.status)} · {new Date(activeProject.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <TouchableOpacity style={styles.primaryBtnSmall} onPress={() => onOpenProject(activeProject.id)}>
              <Text style={styles.btnTxt}>Åpne</Text>
            </TouchableOpacity>
          </View>
          {activeProject.budgetPlanned ? (
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
            <TouchableOpacity style={styles.secondaryBtnSmall} onPress={() => onAddLogToProject(activeProject.id)}>
              <Text style={styles.secondaryBtnText}>Legg til logg</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtnSmall} onPress={() => onSetActiveProject(null)}>
              <Text style={styles.secondaryBtnText}>Fjern aktiv</Text>
            </TouchableOpacity>
          </View>
        </View>
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
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onOpenProject(item.id)}
            style={styles.projectListItem}>
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
                      <Ionicons name={isActive ? 'star' : 'star-outline'} size={16} color={isActive ? theme.warning : theme.textDim} />
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
                  <Text style={styles.projectBadge}>{formatProjectStatusLabel(item.status).toUpperCase()}</Text>
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
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => onOpenProject(item.id)}
                style={styles.projectListItem}>
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
                          <Ionicons name={isActive ? 'star' : 'star-outline'} size={16} color={isActive ? theme.warning : theme.textDim} />
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
                      <Text style={styles.projectBadge}>{formatProjectStatusLabel(item.status).toUpperCase()}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
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
  onEditNickname,
  onSignOut,
  onClose,
  username,
}: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const safeCar = car ?? {};
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.pageHeaderRow, { paddingHorizontal: 0 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onClose}>
            <Ionicons name="chevron-back" size={20} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.pageTitle}>Innstillinger</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.settingsHeader}>KJØRETØY</Text>
    <View style={styles.settingsGroup}>
      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>Registreringsnummer</Text>
        <Text style={styles.settingsValue}>{safeCar.plate}</Text>
      </View>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsRow} onPress={onEditNickname}>
        <Text style={styles.settingsLabel}>Kallenavn</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.settingsValue, !safeCar.nickname && { color: theme.textDim }]}>
            {safeCar.nickname || 'Legg til kallenavn'}
          </Text>
          <Ionicons name="create-outline" size={18} color={theme.textDim} />
        </View>
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>Understellsnummer</Text>
        <Text style={styles.settingsValue}>{safeCar.vin}</Text>
      </View>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsRow} onPress={onChangeCar}>
        <Text style={styles.settingsLabel}>Bytt bil</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
      </TouchableOpacity>
    </View>

    <Text style={styles.settingsHeader}>Enheter</Text>
    <View style={styles.settingsGroup}>
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeUnits('km')}>
        <Text style={styles.settingsChoiceLabel}>Kilometer</Text>
        {units === 'km' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeUnits('mi')}>
        <Text style={styles.settingsChoiceLabel}>Miles</Text>
        {units === 'mi' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
    </View>

    <Text style={styles.settingsHeader}>Tema</Text>
    <View style={styles.settingsGroup}>
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeAppTheme('system')}>
        <Text style={styles.settingsChoiceLabel}>System</Text>
        {appTheme === 'system' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeAppTheme('light')}>
        <Text style={styles.settingsChoiceLabel}>Lys</Text>
        {appTheme === 'light' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsChoiceRow} onPress={() => onChangeAppTheme('dark')}>
        <Text style={styles.settingsChoiceLabel}>Mørk</Text>
        {appTheme === 'dark' && <Ionicons name="checkmark" size={18} color={theme.primary} />}
      </TouchableOpacity>
    </View>

    <Text style={styles.settingsHeader}>Konto</Text>
    <View style={styles.settingsGroup}>
      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>Brukernavn</Text>
        <Text style={styles.settingsValue}>{username || '—'}</Text>
      </View>
      <View style={styles.settingsDivider} />
      <TouchableOpacity style={styles.settingsRow} onPress={onSignOut}>
        <Text style={styles.settingsLabel}>Logg ut</Text>
        <Ionicons name="log-out-outline" size={18} color={theme.textDim} />
      </TouchableOpacity>
    </View>

    <View style={styles.settingsGroup}>
      <TouchableOpacity style={styles.settingsRow} onPress={onDelete}>
        <Text style={styles.settingsDestructive}>Slett kjøretøy</Text>
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
  const [category, setCategory] = useState(project?.category || '');
  const [budget, setBudget] = useState(project?.budgetPlanned ? String(project.budgetPlanned) : '');

  useEffect(() => {
    setTitle(project?.title || '');
    setCategory(project?.category || '');
    setBudget(project?.budgetPlanned ? String(project.budgetPlanned) : '');
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
              category,
              budgetPlanned: budget ? Number(budget) : null
            })
          }>
          <Text style={styles.modalSaveText}>Lagre</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.logForm}>
        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Detaljer</Text>
          <View style={styles.listGroup}>
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Tittel</Text>
              <TextInput
                style={styles.listInput}
                placeholder="Motoroverhaling"
                placeholderTextColor={theme.textDim}
                value={title}
                onChangeText={setTitle}
              />
            </View>
            <View style={styles.listDivider} />
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Kategori</Text>
              <TextInput
                style={styles.listInput}
                placeholder="Motor"
                placeholderTextColor={theme.textDim}
                value={category}
                onChangeText={setCategory}
              />
            </View>
            <View style={styles.listDivider} />
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Planlagt</Text>
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
            <Ionicons name="close" size={22} color="white" />
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

const SpecBox = ({ label, value, icon }: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.specBox}>
      <Ionicons name={icon} size={18} color={theme.primary} style={{marginBottom: 8}} />
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={[styles.specValue, !value && {color: theme.danger}]}>
        {value || 'Ukjent'}
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
              <Text style={[styles.logMeta, { color: theme.primary }]}>{photoCount} bilde{photoCount > 1 ? 'r' : ''}</Text>
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
  const titleRef = useRef<TextInput>(null);
  const costRef = useRef<TextInput>(null);
  const mileageRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const prevSeedRef = useRef<number | null>(null);
  const prevLogIdRef = useRef<string | null>(null);
  const formatLogDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const typeLabel = (value: LogType) => formatLogTypeLabel(value);
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
              <TextInput
                ref={titleRef}
                style={styles.listInput}
                placeholderTextColor={theme.textDim}
                placeholder="Oljeskift"
                value={title}
                onChangeText={setTitle}
                returnKeyType="next"
                onSubmitEditing={() => costRef.current?.focus()}
              />
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
            <TouchableOpacity style={styles.listRow} onPress={onManageTypes}>
              <Text style={styles.listLabel}>Type</Text>
              <View style={styles.listValueRow}>
                <Text style={styles.listValue}>
                  {formatLogTypeLabel(logType || availableTypes[0])}
                </Text>
              </View>
            </TouchableOpacity>
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
          <Text style={styles.sectionHeader}>Bilder</Text>
          <View style={[styles.listGroup, { padding: 12, gap: 10 }]}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, borderColor: theme.cardBorder }]} onPress={() => pickPhotos('library')}>
                <Text style={{ color: theme.text, textAlign: 'center' }}>Legg til fra bibliotek</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, { flex: 1, borderColor: theme.cardBorder }]} onPress={() => pickPhotos('camera')}>
                <Text style={{ color: theme.text, textAlign: 'center' }}>Bruk kamera</Text>
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
              <TextInput
                ref={costRef}
                style={styles.listInput}
                placeholderTextColor={theme.textDim}
                placeholder="0"
                keyboardType="numeric"
                value={cost}
                onChangeText={setCost}
                returnKeyType="next"
                onSubmitEditing={() => mileageRef.current?.focus()}
              />
            </View>
            <View style={styles.listDivider} />
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Kilometerstand</Text>
              <TextInput
                ref={mileageRef}
                style={styles.listInput}
                placeholderTextColor={theme.textDim}
                placeholder={mileagePlaceholder}
                keyboardType="numeric"
                value={mileage}
                onChangeText={setMileage}
                returnKeyType="next"
                onSubmitEditing={() => notesRef.current?.focus()}
              />
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
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
            />
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
          {units && <Text style={styles.popupHelp}>Enhet: {units.toUpperCase()}</Text>}
          <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
            <TouchableOpacity onPress={onClose} style={[styles.popupBtn, {backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.cardBorder}]}><Text style={{color: theme.text}}>Avbryt</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => onSave(val)} style={[styles.popupBtn, {backgroundColor: theme.primary}]}><Text style={{fontWeight: '600', color: 'white'}}>Lagre</Text></TouchableOpacity>
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
          <Ionicons name="add" size={20} color="white" />
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
                      <Ionicons name="trash" size={18} color="white" />
                    </TouchableOpacity>
                  )}>
                  <View style={styles.listRow}>
                    <TouchableOpacity style={styles.typeSelectBtn} onPress={() => onSelectType(type)}>
                      <View style={styles.typeNameRow}>
                        <Ionicons name={getTypeIconName(type)} size={16} color={theme.textDim} />
                        <Text style={styles.typeName}>{formatLogTypeLabel(type)}</Text>
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

const Onboarding = ({ onRegister, cars, userEmail, onSelectCar }: any) => {
  const { theme, statusBarStyle } = useTheme();
  const styles = useStyles();
  const [plate, setPlate] = useState('');
  const [load, setLoad] = useState(false);
  const emailLabel = userEmail ? `Innlogget som ${userEmail}` : null;
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
          <Text style={styles.onboardingTitle}>Hanskerommet</Text>
          <Text style={styles.onboardingSub}>Loggfør servicehistorikk på sekunder.</Text>
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
            placeholder="REGISTRERINGSNUMMER" 
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
