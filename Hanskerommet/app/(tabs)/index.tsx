import React, { useState, useMemo } from 'react';
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
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StatusBar as RNStatusBar
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

// --- CONFIGURATION ---
// ⚠️ SET THIS TO TRUE FOR DEVELOPMENT/PROTOTYPING
const USE_MOCK_API = true; 

// --- 1. TYPES & INTERFACES ---

type MaintenanceType = 'service' | 'repair' | 'upgrade' | 'inspection' | 'other';

interface ServiceLog {
  id: string;
  title: string;
  date: string;
  mileage: number;
  cost: number;
  type: MaintenanceType;
  notes: string;
  hasReceipt: boolean; 
}

interface Car {
  plate: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  nextEU: string; // ISO Date String YYYY-MM-DD
  mileage: number; // Last known mileage
}

// --- 2. THEME CONFIGURATION ---

const THEME = {
  primary: '#0F172A', 
  accent: '#3B82F6', 
  background: '#F8FAFC', 
  card: '#FFFFFF',
  text: '#334155',
  textLight: '#64748B',
  success: '#10B981', 
  warning: '#F59E0B', 
  danger: '#EF4444', 
  border: '#E2E8F0',
};

// --- 3. API SERVICE HANDLER ---

// Mock Data Generator
const getMockCar = (plate: string): Car => {
  // Simulate different cars based on plate input
  const isAudi = plate.toUpperCase().startsWith('DR');
  
  return {
    plate: plate.toUpperCase(),
    make: isAudi ? 'Audi' : 'Volkswagen',
    model: isAudi ? 'A4 Avant' : 'Golf 2.0 TDI',
    year: isAudi ? 2020 : 2018,
    vin: isAudi ? 'WAUZZZ8K...' : 'WVWZZZ1K...',
    nextEU: isAudi ? '2024-05-15' : '2025-10-20', // Change dates here to test colors
    mileage: isAudi ? 45000 : 120000,
  };
};

// The Fetch Function
const fetchCarDetails = async (plate: string): Promise<Car> => {
  // 1. SIMULATION MODE (Recommended for Dev)
  if (USE_MOCK_API) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(getMockCar(plate));
      }, 1000); // Simulate 1s network delay
    });
  }

  // 2. REAL API MODE (Only if you have a working Backend/Key)
  // Note: Statens Vegvesen API usually requires a Server Proxy, not direct App calls.
  try {
    const API_KEY = 'xxx'; // Do not commit this to GitHub
    const url = `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${plate.replace(/\s/g, '')}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'SVV-Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json'
      },
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const data = await response.json();
    const carData = data?.kjoretoydataListe?.[0];

    if (!carData) throw new Error("Car not found");

    // Mapping logic (This is correct based on SVV structure)
    return {
      plate: carData.kjennemerke?.[0]?.kjennemerke || plate,
      make: carData.tekniskGodkjenning?.tekniskeData?.generelt?.merke?.[0]?.merke || 'Unknown',
      model: carData.tekniskGodkjenning?.tekniskeData?.generelt?.handelsbetegnelse?.[0] || 'Unknown',
      year: carData.forstegangsregistrering?.registrertForstegangNorgeDato ? new Date(carData.forstegangsregistrering.registrertForstegangNorgeDato).getFullYear() : 0,
      vin: carData.kjoretoyId?.understellsnummer || 'N/A',
      nextEU: carData.periodiskKjoretoyKontroll?.kontrollfrist || 'N/A',
      mileage: 0,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

// --- 4. MAIN COMPONENT ---

export default function App() {
  const [userCar, setUserCar] = useState<Car | null>(null);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [view, setView] = useState<'onboarding' | 'dashboard' | 'logs' | 'analytics'>('onboarding');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleRegisterCar = async (plate: string) => {
    try {
      const carData = await fetchCarDetails(plate);
      setUserCar(carData);
      setView('dashboard');
    } catch (error) {
      Alert.alert("Error", "Could not find car. Try using Mock Mode in code.");
    }
  };

  const handleAddLog = (newLog: ServiceLog) => {
    setLogs([newLog, ...logs]);
    if (userCar && newLog.mileage > userCar.mileage) {
      setUserCar({ ...userCar, mileage: newLog.mileage });
    }
    setIsAddModalOpen(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }}>
        
        {view === 'onboarding' ? (
          <OnboardingScreen onRegister={handleRegisterCar} />
        ) : (
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Glovebox</Text>
                <Text style={styles.headerSubtitle}>{userCar?.plate} • {userCar?.model}</Text>
              </View>
              <TouchableOpacity onPress={() => setView('analytics')} style={styles.iconBtn}>
                <Ionicons name="stats-chart" size={24} color={THEME.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              {view === 'dashboard' && (
                <Dashboard 
                  car={userCar!} 
                  logs={logs} 
                  onAddPress={() => setIsAddModalOpen(true)}
                  onViewHistory={() => setView('logs')}
                />
              )}
              {view === 'logs' && (
                <LogHistory 
                  logs={logs} 
                  onBack={() => setView('dashboard')} 
                />
              )}
              {view === 'analytics' && (
                <AnalyticsView 
                  logs={logs} 
                  onBack={() => setView('dashboard')}
                />
              )}
            </View>

            <View style={styles.tabBar}>
              <TabIcon icon="home" label="Home" active={view === 'dashboard'} onPress={() => setView('dashboard')} />
              <TabIcon icon="list" label="History" active={view === 'logs'} onPress={() => setView('logs')} />
              <View style={{ width: 48 }} /> 
              <TabIcon icon="pie-chart" label="Costs" active={view === 'analytics'} onPress={() => setView('analytics')} />
              <TabIcon icon="car" label="My Car" active={false} onPress={() => Alert.alert("Car Settings", "Edit vehicle details here.")} />
              <TouchableOpacity style={styles.fab} onPress={() => setIsAddModalOpen(true)}>
                <Ionicons name="add" size={32} color="white" />
              </TouchableOpacity>
            </View>
          </>
        )}

        <AddLogModal 
          visible={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onSave={handleAddLog}
        />
      </SafeAreaView>
    </View>
  );
}

// --- 5. SUB-COMPONENTS ---

const OnboardingScreen = ({ onRegister }: { onRegister: (plate: string) => void }) => {
  const [plate, setPlate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (plate.length < 4) return Alert.alert("Invalid Plate", "Enter a valid license plate.");
    setLoading(true);
    await onRegister(plate);
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.centerContainer}>
      <View style={styles.logoCircle}>
        <Ionicons name="car-sport" size={48} color={THEME.accent} />
      </View>
      <Text style={styles.title}>Welcome to Glovebox</Text>
      <Text style={styles.subtitle}>Enter your license plate to fetch car details.</Text>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>LICENSE PLATE</Text>
        <TextInput 
          style={styles.inputLarge} 
          placeholder="EK 12345" 
          placeholderTextColor="#CBD5E1"
          autoCapitalize="characters"
          value={plate}
          onChangeText={setPlate}
        />
      </View>
      <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Find My Car</Text>}
      </TouchableOpacity>
      {USE_MOCK_API && <Text style={{marginTop: 20, color: THEME.textLight, fontSize: 12}}>(Running in Simulation Mode)</Text>}
    </KeyboardAvoidingView>
  );
};

const Dashboard = ({ car, logs, onAddPress, onViewHistory }: { car: Car, logs: ServiceLog[], onAddPress: () => void, onViewHistory: () => void }) => {
  const daysUntilEU = useMemo(() => {
    if (!car.nextEU || car.nextEU === 'N/A') return null;
    const today = new Date();
    const target = new Date(car.nextEU);
    const diff = target.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  }, [car.nextEU]);

  const euStatus = daysUntilEU === null ? 'unknown' : daysUntilEU < 30 ? 'danger' : daysUntilEU < 90 ? 'warning' : 'success';
  const euColor = euStatus === 'unknown' ? THEME.textLight : THEME[euStatus];
  const totalSpend = logs.reduce((sum, log) => sum + log.cost, 0);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: euColor }]}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardLabel}>NEXT EU CONTROL</Text>
            {daysUntilEU !== null ? (
              <>
                <Text style={[styles.bigNumber, { color: euColor }]}>
                  {daysUntilEU < 0 ? `Overdue` : `${daysUntilEU}`} 
                  <Text style={styles.smallUnit}>{daysUntilEU < 0 ? '' : ' days left'}</Text>
                </Text>
                <Text style={styles.cardSub}>Deadline: {car.nextEU}</Text>
              </>
            ) : (
              <Text style={styles.statValue}>Not Available</Text>
            )}
          </View>
          <Ionicons name="calendar" size={40} color={euColor} style={{ opacity: 0.2 }} />
        </View>
      </View>

      <CarDetailsCard car={car} />

      <View style={styles.row}>
        <View style={[styles.card, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.cardLabel}>TOTAL SPENT</Text>
          <Text style={styles.statValue}>{totalSpend.toLocaleString()} kr</Text>
        </View>
        <View style={[styles.card, { flex: 1 }]}>
          <Text style={styles.cardLabel}>ODOMETER</Text>
          <Text style={styles.statValue}>{car.mileage.toLocaleString()}</Text>
          <Text style={styles.smallUnit}>km</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Log</Text>
        <TouchableOpacity onPress={onViewHistory}><Text style={styles.linkText}>View All</Text></TouchableOpacity>
      </View>

      {logs.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No service history yet.</Text>
          <TouchableOpacity onPress={onAddPress} style={styles.btnSmall}><Text style={styles.btnSmallText}>+ Add First Log</Text></TouchableOpacity>
        </View>
      ) : (
        logs.slice(0, 3).map((log) => <LogItem key={log.id} log={log} />)
      )}
    </ScrollView>
  );
};

const CarDetailsCard = ({ car }: { car: Car }) => (
  <View style={styles.card}>
    <Text style={styles.cardLabel}>VEHICLE DETAILS</Text>
    <View style={styles.detailRow}>
      <Text style={styles.detailTitle}>Make</Text>
      <Text style={styles.detailValue}>{car.make}</Text>
    </View>
    <View style={styles.detailRow}>
      <Text style={styles.detailTitle}>Model</Text>
      <Text style={styles.detailValue}>{car.model}</Text>
    </View>
    <View style={styles.detailRow}>
      <Text style={styles.detailTitle}>Year</Text>
      <Text style={styles.detailValue}>{car.year}</Text>
    </View>
    <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
      <Text style={styles.detailTitle}>VIN</Text>
      <Text style={styles.detailValue}>{car.vin}</Text>
    </View>
  </View>
);

const LogHistory = ({ logs, onBack }: { logs: ServiceLog[], onBack: () => void }) => {
  const [search, setSearch] = useState('');
  const filteredLogs = logs.filter(l => l.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={THEME.textLight} />
        <TextInput style={styles.searchInput} placeholder="Search..." value={search} onChangeText={setSearch} />
      </View>
      <FlatList 
        data={filteredLogs}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <LogItem log={item} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20, color: THEME.textLight }}>No logs found.</Text>}
      />
    </View>
  );
};

const AnalyticsView = ({ logs, onBack }: { logs: ServiceLog[], onBack: () => void }) => {
  const costsByType = logs.reduce((acc, log) => {
    acc[log.type] = (acc[log.type] || 0) + log.cost;
    return acc;
  }, {} as Record<MaintenanceType, number>);
  const total = Object.values(costsByType).reduce((a, b) => a + b, 0);

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={styles.title}>Cost Breakdown</Text>
      <View style={{ height: 20 }} />
      {Object.entries(costsByType).map(([type, amount]) => {
        const percent = total > 0 ? (amount / total) * 100 : 0;
        return (
          <View key={type} style={{ marginBottom: 20 }}>
            <View style={styles.rowBetween}>
              <Text style={{ textTransform: 'capitalize', fontWeight: '600' }}>{type}</Text>
              <Text style={{ fontWeight: 'bold' }}>{amount} kr</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: getTypeColor(type as MaintenanceType) }]} />
            </View>
          </View>
        )
      })}
    </View>
  );
};

const AddLogModal = ({ visible, onClose, onSave }: { visible: boolean, onClose: () => void, onSave: (l: ServiceLog) => void }) => {
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<MaintenanceType>('service');

  const handleSave = () => {
    if (!title || !cost) return Alert.alert("Missing Info", "Please enter Title and Cost");
    onSave({
      id: Date.now().toString(),
      title,
      cost: parseInt(cost),
      mileage: parseInt(mileage) || 0,
      date: new Date().toISOString().split('T')[0],
      type,
      notes,
      hasReceipt: false,
    });
    setTitle(''); setCost(''); setMileage(''); setNotes('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Entry</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: THEME.accent, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {['service', 'repair', 'upgrade', 'inspection'].map((t) => (
              <TouchableOpacity key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t as MaintenanceType)}>
                <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.label}>WHAT DID YOU DO?</Text>
          <TextInput style={styles.input} placeholder="e.g. Changed Oil & Filter" value={title} onChangeText={setTitle} />
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.label}>COST (NOK)</Text>
              <TextInput style={styles.input} placeholder="0" keyboardType="numeric" value={cost} onChangeText={setCost} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>MILEAGE (KM)</Text>
              <TextInput style={styles.input} placeholder="Optional" keyboardType="numeric" value={mileage} onChangeText={setMileage} />
            </View>
          </View>
          <Text style={styles.label}>NOTES</Text>
          <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} multiline value={notes} onChangeText={setNotes} />
          <TouchableOpacity style={styles.btnPrimary} onPress={handleSave}><Text style={styles.btnText}>Save Entry</Text></TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const LogItem = ({ log }: { log: ServiceLog }) => (
  <View style={styles.logItem}>
    <View style={[styles.logIcon, { backgroundColor: getTypeColor(log.type) + '20' }]}> 
      <Ionicons name={getIconForType(log.type)} size={20} color={getTypeColor(log.type)} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.logTitle}>{log.title}</Text>
      <Text style={styles.logDate}>{log.date} • {log.mileage} km</Text>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.logCost}>{log.cost} kr</Text>
    </View>
  </View>
);

const TabIcon = ({ icon, label, active, onPress }: any) => (
  <TouchableOpacity style={{ alignItems: 'center' }} onPress={onPress}>
    <Ionicons name={active ? icon : `${icon}-outline`} size={24} color={active ? THEME.accent : THEME.textLight} />
    <Text style={{ fontSize: 10, color: active ? THEME.accent : THEME.textLight, marginTop: 4 }}>{label}</Text>
  </TouchableOpacity>
);

function getTypeColor(type: MaintenanceType) {
  switch (type) {
    case 'repair': return THEME.danger;
    case 'upgrade': return '#8B5CF6'; 
    case 'service': return THEME.success;
    default: return THEME.textLight;
  }
}

function getIconForType(type: MaintenanceType) {
  switch (type) {
    case 'repair': return 'construct';
    case 'upgrade': return 'rocket';
    case 'service': return 'water';
    default: return 'build';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centerContainer: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: THEME.background },
  content: { flex: 1, padding: 20 },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: THEME.background },
  headerTitle: { fontSize: 28, fontWeight: '800', color: THEME.primary, letterSpacing: -1 },
  headerSubtitle: { fontSize: 14, color: THEME.textLight, fontWeight: '600' },
  iconBtn: { padding: 8, backgroundColor: '#fff', borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  title: { fontSize: 24, fontWeight: 'bold', color: THEME.primary, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: THEME.textLight, textAlign: 'center', marginBottom: 32 },
  label: { fontSize: 12, fontWeight: '700', color: THEME.textLight, marginBottom: 6, letterSpacing: 0.5 },
  inputLarge: { backgroundColor: '#fff', borderWidth: 1, borderColor: THEME.border, borderRadius: 16, padding: 20, fontSize: 24, textAlign: 'center', fontWeight: 'bold', color: THEME.primary },
  input: { backgroundColor: '#F1F5F9', borderRadius: 12, padding: 16, fontSize: 16, color: THEME.primary, marginBottom: 16 },
  inputContainer: { width: '100%', marginBottom: 24 },
  btnPrimary: { backgroundColor: THEME.primary, paddingVertical: 20, borderRadius: 16, alignItems: 'center', width: '100%' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: THEME.accent + '20', borderRadius: 8, marginTop: 10 },
  btnSmallText: { color: THEME.accent, fontWeight: '600', fontSize: 14 },
  logoCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: THEME.accent + '20', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: THEME.textLight, marginBottom: 4, textTransform: 'uppercase' },
  bigNumber: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  smallUnit: { fontSize: 16, fontWeight: '600', color: THEME.textLight },
  cardSub: { fontSize: 13, color: THEME.textLight, marginTop: 4 },
  statValue: { fontSize: 22, fontWeight: 'bold', color: THEME.primary },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.border },
  detailTitle: { fontSize: 14, color: THEME.textLight },
  detailValue: { fontSize: 14, color: THEME.text, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.primary },
  linkText: { color: THEME.accent, fontWeight: '600' },
  logItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 8 },
  logIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  logTitle: { fontSize: 16, fontWeight: '600', color: THEME.text },
  logDate: { fontSize: 12, color: THEME.textLight, marginTop: 2 },
  logCost: { fontSize: 16, fontWeight: '700', color: THEME.primary },
  emptyBox: { alignItems: 'center', padding: 40, borderWidth: 2, borderColor: '#F1F5F9', borderStyle: 'dashed', borderRadius: 20 },
  emptyText: { color: THEME.textLight, fontSize: 16 },
  searchBar: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, marginHorizontal: 20, borderRadius: 12, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: THEME.border },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: '#fff', paddingTop: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: THEME.border },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: THEME.accent + '20', borderColor: THEME.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: THEME.textLight },
  chipTextActive: { color: THEME.accent },
  photoUpload: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 16, marginBottom: 24 },
  progressBarBg: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: THEME.border, alignItems: 'center', justifyContent: 'space-between', paddingBottom: Platform.OS === 'ios' ? 30 : 12 },
  fab: { position: 'absolute', top: -25, left: '50%', marginLeft: -28, width: 56, height: 56, borderRadius: 28, backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center', shadowColor: THEME.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
});