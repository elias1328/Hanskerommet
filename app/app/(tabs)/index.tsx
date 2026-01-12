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
  ActivityIndicator,
  FlatList,
  Modal,
  LayoutAnimation,
  UIManager,
  ImageBackground,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; // Ensure you have expo-linear-gradient installed, or remove if standard Expo

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- CONFIGURATION ---
const USE_MOCK_API = false; // Set to true if you hit API limits
const TIRE_CHANGE_MONTH_WINTER = 9; // October (0-indexed)
const TIRE_CHANGE_MONTH_SUMMER = 3; // April

// --- 1. TYPES ---

type LogType = 'service' | 'repair' | 'upgrade' | 'inspection' | 'fuel' | 'system';

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

// --- 2. THEME (MIDNIGHT EDITION) ---

const THEME = {
  bg: '#0F172A',       // Deep Navy
  card: '#1E293B',     // Lighter Navy
  cardBorder: '#334155',
  primary: '#38BDF8',  // Sky Blue
  accent: '#F472B6',   // Pink (Cyberpunk accent)
  success: '#34D399',  // Mint
  warning: '#FBBF24',  // Amber
  danger: '#F87171',   // Red
  text: '#F8FAFC',     // White-ish
  textDim: '#94A3B8',  // Grey
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
  const response = await fetch(url);

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
  const [view, setView] = useState<'onboarding' | 'garage' | 'vault' | 'logs' | 'config'>('onboarding');
  const [car, setCar] = useState<Car | null>(null);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [docs, setDocs] = useState<Doc[]>([
    { id: '1', title: 'Insurance Policy', expiry: '2025-01-01', type: 'insurance' },
    { id: '2', title: 'Vognkort (Del 2)', expiry: 'Never', type: 'vognkort' }
  ]);
  
  // Modals
  const [modals, setModals] = useState({ addLog: false, mileage: false, editSpec: false });
  const [specToEdit, setSpecToEdit] = useState<{key: keyof Car, label: string} | null>(null);

  // --- ACTIONS ---

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

  const handleUpdateSpec = (val: string) => {
    if (!car || !specToEdit) return;
    setCar({ ...car, [specToEdit.key]: val });
    setModals({ ...modals, editSpec: false });
  };

  const handleAddLog = (log: ServiceLog) => {
    // If mileage increased in log, update car
    if (car && log.mileage > car.mileage) {
      handleUpdateMileage(log.mileage); // This triggers the audit log too!
    }
    setLogs([log, ...logs]);
    setModals({ ...modals, addLog: false });
  };

  const deleteCar = () => {
    Alert.alert("Nuclear Option", "Delete this car and all history?", [
      { text: "Cancel", style: 'cancel' },
      { text: "Delete", style: 'destructive', onPress: () => { setCar(null); setLogs([]); setView('onboarding'); } }
    ]);
  };

  // --- RENDER ---

  if (view === 'onboarding') return <Onboarding onRegister={handleRegister} />;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Dynamic Header Area (Part of ScrollView in sub-screens, or Fixed) */}
      <SafeAreaView style={{ flex: 1 }}>
        {view === 'garage' && (
          <GarageScreen 
            car={car!} 
            logs={logs} 
            onOpenLog={() => setModals({...modals, addLog: true})}
            onOpenMileage={() => setModals({...modals, mileage: true})}
            onEditSpec={(key, label) => { setSpecToEdit({key, label}); setModals({...modals, editSpec: true}); }}
            onViewAllLogs={() => setView('logs')}
          />
        )}
        {view === 'vault' && <VaultScreen docs={docs} />}
        {view === 'logs' && <TimelineScreen logs={logs} />}
        {view === 'config' && <ConfigScreen car={car!} onDelete={deleteCar} />}

        {/* --- CUSTOM TAB BAR (Perfectly Centered FAB) --- */}
        <View style={styles.tabBarContainer}>
          <View style={styles.tabBar}>
            <TabBtn icon="car-sport" label="Garage" active={view === 'garage'} onPress={() => setView('garage')} />
            <TabBtn icon="file-tray-full" label="Vault" active={view === 'vault'} onPress={() => setView('vault')} />
            
            {/* The Invisible Spacer for FAB */}
            <View style={{ width: 60 }} />

            <TabBtn icon="list" label="Logs" active={view === 'logs'} onPress={() => setView('logs')} />
            <TabBtn icon="cog" label="Config" active={view === 'config'} onPress={() => setView('config')} />
          </View>

          {/* Floating Action Button (Absolute Centered) */}
          <TouchableOpacity 
            style={styles.fab} 
            activeOpacity={0.8}
            onPress={() => setModals({...modals, addLog: true})}
          >
            <LinearGradient colors={[THEME.primary, '#0284c7']} style={styles.fabGradient}>
              <Ionicons name="add" size={32} color="white" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* --- MODALS --- */}
        <AddLogModal 
          visible={modals.addLog} 
          onClose={() => setModals({...modals, addLog: false})} 
          onSave={handleAddLog} 
        />
        <SimpleInputModal
          visible={modals.mileage}
          title="Update Odometer"
          placeholder={car?.mileage.toString()}
          keyboard="numeric"
          onClose={() => setModals({...modals, mileage: false})}
          onSave={(val) => handleUpdateMileage(parseInt(val) || 0)}
        />
        <SimpleInputModal
          visible={modals.editSpec}
          title={`Edit ${specToEdit?.label}`}
          placeholder="Enter value..."
          keyboard="default"
          onClose={() => setModals({...modals, editSpec: false})}
          onSave={handleUpdateSpec}
        />

      </SafeAreaView>
    </View>
  );
}

// --- SCREENS ---

const GarageScreen = ({ car, logs, onOpenLog, onOpenMileage, onEditSpec, onViewAllLogs }: any) => {
  const currentMonth = new Date().getMonth();
  const isWinterTireSeason = currentMonth >= TIRE_CHANGE_MONTH_WINTER || currentMonth <= TIRE_CHANGE_MONTH_SUMMER;
  const daysToEu = Math.ceil((new Date(car.nextEU).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
  const euStatus = daysToEu < 30 ? 'danger' : daysToEu < 120 ? 'warning' : 'success';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
      {/* Hero Card */}
      <View style={styles.heroContainer}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroBrand}>{car.make}</Text>
          <View style={styles.plateTag}><Text style={styles.plateText}>{car.plate}</Text></View>
        </View>
        <Text style={styles.heroModel}>{car.model}</Text>
        <Text style={styles.heroVin}>{car.vin}</Text>
        
        <TouchableOpacity style={styles.mileageBtn} onPress={onOpenMileage}>
          <Ionicons name="speedometer-outline" size={20} color={THEME.primary} />
          <Text style={styles.mileageText}>{car.mileage.toLocaleString()} km</Text>
          <Ionicons name="pencil" size={12} color={THEME.textDim} style={{marginLeft: 8}}/>
        </TouchableOpacity>
      </View>

      {/* Alerts / Seasonals */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ALERTS & STATUS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
          
          <AlertCard 
            color={THEME[euStatus]} 
            icon="calendar" 
            title="EU Control" 
            value={daysToEu < 0 ? "OVERDUE" : `${daysToEu} days`} 
            sub={car.nextEU}
          />
          
          <AlertCard 
            color={isWinterTireSeason ? THEME.primary : THEME.warning} 
            icon="snow" 
            title="Season" 
            value={isWinterTireSeason ? "Winter Mode" : "Summer Mode"} 
            sub="Check tires"
          />

          <AlertCard 
            color={THEME.accent} 
            icon="wallet" 
            title="Total Cost" 
            value={`${logs.reduce((a:any,b:any)=>a+b.cost,0)} kr`} 
            sub="Lifetime"
          />

        </ScrollView>
      </View>

      {/* Interactive Specs Grid */}
      <View style={styles.section}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <Text style={styles.sectionTitle}>TECHNICAL SPECS</Text>
          <Text style={{color: THEME.textDim, fontSize: 10}}>TAP TO EDIT</Text>
        </View>
        
        <View style={styles.grid}>
          <SpecBox label="Top Speed" value={car.topSpeed} icon="speedometer" onPress={() => onEditSpec('topSpeed', 'Top Speed')} />
          <SpecBox label="Fuel" value={car.fuelType} icon="water" onPress={() => onEditSpec('fuelType', 'Fuel Type')} />
          <SpecBox label="Engine" value={car.engineLiters} icon="cog" onPress={() => onEditSpec('engineLiters', 'Engine')} />
          <SpecBox label="Total Weight" value={car.totalWeight} icon="barbell" onPress={() => onEditSpec('totalWeight', 'Total Weight')} />
          <SpecBox label="Seats" value={car.seats} icon="people" onPress={() => onEditSpec('seats', 'Seats')} />
          <SpecBox label="Year" value={car.year.toString()} icon="calendar-number" onPress={() => {}} />
        </View>
      </View>

      {/* Recent History */}
      <View style={styles.section}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
          <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
          <TouchableOpacity onPress={onViewAllLogs}><Text style={{color: THEME.primary, fontWeight: 'bold'}}>View All</Text></TouchableOpacity>
        </View>
        {logs.slice(0,3).map((l: ServiceLog) => <LogRow key={l.id} log={l} />)}
      </View>

    </ScrollView>
  );
};

const VaultScreen = ({ docs }: { docs: Doc[] }) => (
  <View style={styles.screenContainer}>
    <Text style={styles.pageTitle}>The Vault</Text>
    <Text style={styles.pageSub}>Secure storage for your vehicle documents.</Text>
    
    <FlatList
      data={docs}
      keyExtractor={d => d.id}
      renderItem={({item}) => (
        <TouchableOpacity style={styles.docRow}>
          <View style={[styles.docIcon, { backgroundColor: item.type === 'insurance' ? THEME.success : THEME.accent }]}>
            <Ionicons name="document-text" size={24} color="white" />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.docTitle}>{item.title}</Text>
            <Text style={styles.docSub}>Expires: {item.expiry}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={THEME.textDim} />
        </TouchableOpacity>
      )}
    />
    <TouchableOpacity style={styles.dashedBtn} onPress={() => Alert.alert("Demo", "Camera scanner would open here.")}>
      <Text style={{color: THEME.textDim}}>+ Upload Document</Text>
    </TouchableOpacity>
  </View>
);

const TimelineScreen = ({ logs }: { logs: ServiceLog[] }) => (
  <View style={styles.screenContainer}>
    <Text style={styles.pageTitle}>Service Timeline</Text>
    <FlatList 
      data={logs}
      keyExtractor={l => l.id}
      contentContainerStyle={{paddingBottom: 100}}
      renderItem={({item}) => <LogRow log={item} />}
    />
  </View>
);

const ConfigScreen = ({ car, onDelete }: any) => (
  <View style={styles.screenContainer}>
    <Text style={styles.pageTitle}>Configuration</Text>
    
    <View style={styles.configSection}>
      <Text style={styles.configHeader}>VEHICLE DATA</Text>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Plate Number</Text>
        <Text style={styles.configValue}>{car.plate}</Text>
      </View>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>VIN</Text>
        <Text style={styles.configValue}>{car.vin}</Text>
      </View>
    </View>

    <View style={styles.configSection}>
      <Text style={styles.configHeader}>PREFERENCES</Text>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Dark Mode</Text>
        <Text style={{color: THEME.success, fontWeight: 'bold'}}>ALWAYS ON</Text>
      </View>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Currency</Text>
        <Text style={styles.configValue}>NOK (kr)</Text>
      </View>
    </View>

    <TouchableOpacity style={styles.dangerBtn} onPress={onDelete}>
      <Ionicons name="trash" size={20} color="white" />
      <Text style={{color: 'white', fontWeight: 'bold', marginLeft: 10}}>DELETE VEHICLE</Text>
    </TouchableOpacity>
  </View>
);

// --- COMPONENTS ---

const SpecBox = ({ label, value, icon, onPress }: any) => (
  <TouchableOpacity style={styles.specBox} onPress={onPress}>
    <Ionicons name={icon} size={20} color={THEME.primary} style={{marginBottom: 8}} />
    <Text style={styles.specLabel}>{label}</Text>
    <Text style={[styles.specValue, !value && {color: THEME.danger}]}>
      {value || 'Unknown'}
    </Text>
  </TouchableOpacity>
);

const AlertCard = ({ color, icon, title, value, sub }: any) => (
  <View style={[styles.alertCard, { borderTopColor: color }]}>
    <Ionicons name={icon} size={24} color={color} style={{marginBottom: 8}} />
    <Text style={styles.alertTitle}>{title}</Text>
    <Text style={[styles.alertValue, { color }]}>{value}</Text>
    <Text style={styles.alertSub}>{sub}</Text>
  </View>
);

const LogRow = ({ log }: { log: ServiceLog }) => (
  <View style={styles.logRow}>
    <View style={styles.logTimelineLine} />
    <View style={[styles.logIconParams, { borderColor: log.isSystemEvent ? THEME.textDim : THEME.primary }]}>
       <Ionicons 
         name={log.isSystemEvent ? "settings" : log.type === 'repair' ? "construct" : "water"} 
         size={14} 
         color={log.isSystemEvent ? THEME.textDim : THEME.primary} 
        />
    </View>
    <View style={styles.logContent}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
        <Text style={styles.logTitle}>{log.title}</Text>
        <Text style={styles.logDate}>{log.date}</Text>
      </View>
      <Text style={styles.logNotes}>{log.notes}</Text>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 4}}>
        <Text style={styles.logMeta}>{log.mileage > 0 ? `${log.mileage} km` : ''}</Text>
        {log.cost > 0 && <Text style={styles.logCost}>{log.cost} kr</Text>}
      </View>
    </View>
  </View>
);

const TabBtn = ({ icon, label, active, onPress }: any) => (
  <TouchableOpacity style={styles.tabBtn} onPress={onPress}>
    <Ionicons name={active ? icon : `${icon}-outline`} size={24} color={active ? THEME.primary : THEME.textDim} />
    <Text style={[styles.tabLabel, { color: active ? THEME.primary : THEME.textDim }]}>{label}</Text>
  </TouchableOpacity>
);

// --- MODALS ---

const AddLogModal = ({ visible, onClose, onSave }: any) => {
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalBase, { backgroundColor: THEME.bg }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalH1}>New Log Entry</Text>
          <TouchableOpacity onPress={onClose}><Text style={{color: THEME.primary}}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{padding: 20}}>
          <Text style={styles.inpLabel}>TITLE</Text>
          <TextInput style={styles.input} placeholderTextColor={THEME.textDim} placeholder="e.g. Oil Change" value={title} onChangeText={setTitle} />
          <View style={{flexDirection: 'row', gap: 10}}>
            <View style={{flex: 1}}>
              <Text style={styles.inpLabel}>COST</Text>
              <TextInput style={styles.input} placeholderTextColor={THEME.textDim} placeholder="0" keyboardType="numeric" value={cost} onChangeText={setCost} />
            </View>
            <View style={{flex: 1}}>
               <Text style={styles.inpLabel}>MILEAGE</Text>
              <TextInput style={styles.input} placeholderTextColor={THEME.textDim} placeholder="Auto" keyboardType="numeric" value={mileage} onChangeText={setMileage} />
            </View>
          </View>
          <Text style={styles.inpLabel}>NOTES</Text>
          <TextInput style={[styles.input, {height: 100}]} multiline placeholderTextColor={THEME.textDim} placeholder="Details..." value={notes} onChangeText={setNotes} />
          
          <TouchableOpacity style={styles.mainBtn} onPress={() => {
            onSave({
              id: Date.now().toString(),
              title: title || 'Service',
              cost: parseInt(cost)||0,
              mileage: parseInt(mileage)||0,
              date: new Date().toISOString().split('T')[0],
              type: 'service',
              notes,
              isSystemEvent: false
            });
            setTitle(''); setCost(''); setNotes('');
          }}>
            <Text style={styles.btnTxt}>Save Entry</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const SimpleInputModal = ({ visible, title, placeholder, keyboard, onClose, onSave }: any) => {
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
            placeholderTextColor={THEME.textDim}
            value={val} 
            onChangeText={setVal} 
            keyboardType={keyboard}
            autoFocus
          />
          <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
            <TouchableOpacity onPress={onClose} style={[styles.popupBtn, {backgroundColor: THEME.card}]}><Text style={{color: THEME.text}}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => onSave(val)} style={[styles.popupBtn, {backgroundColor: THEME.primary}]}><Text style={{fontWeight: 'bold'}}>Save</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const Onboarding = ({ onRegister }: any) => {
  const [plate, setPlate] = useState('');
  const [load, setLoad] = useState(false);
  return (
    <SafeAreaView style={[styles.container, {justifyContent: 'center', alignItems: 'center'}]}>
      <Ionicons name="car-sport" size={80} color={THEME.primary} style={{marginBottom: 20}} />
      <Text style={{fontSize: 32, fontWeight: 'bold', color: 'white'}}>Glovebox</Text>
      <Text style={{color: THEME.textDim, marginBottom: 40}}>Midnight Edition</Text>
      <TextInput 
        style={[styles.input, {width: '80%', textAlign: 'center', fontSize: 24}]} 
        placeholder="LICENSE PLATE" 
        placeholderTextColor={THEME.textDim}
        value={plate}
        onChangeText={setPlate}
        autoCapitalize="characters"
      />
      <TouchableOpacity 
        style={[styles.mainBtn, {width: '80%', marginTop: 20}]} 
        onPress={() => { setLoad(true); onRegister(plate).finally(() => setLoad(false)); }}
      >
        {load ? <ActivityIndicator color="black" /> : <Text style={styles.btnTxt}>START ENGINE</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
};

// --- STYLES (The Midnight Design System) ---

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  screenContainer: { flex: 1, padding: 20 },
  
  // Hero
  heroContainer: { backgroundColor: THEME.card, margin: 20, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: THEME.cardBorder },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroBrand: { color: THEME.primary, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' },
  plateTag: { backgroundColor: 'white', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, flexDirection: 'row', alignItems: 'center' },
  plateText: { color: 'black', fontWeight: 'bold', fontSize: 16 },
  heroModel: { fontSize: 28, fontWeight: '800', color: 'white', marginTop: 4 },
  heroVin: { color: THEME.textDim, fontSize: 12, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  mileageBtn: { marginTop: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', alignSelf: 'flex-start', padding: 8, paddingHorizontal: 12, borderRadius: 20 },
  mileageText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },

  // Sections
  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionTitle: { color: THEME.textDim, fontSize: 12, fontWeight: 'bold', marginBottom: 12, letterSpacing: 1 },
  
  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  specBox: { width: '31%', backgroundColor: THEME.card, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: THEME.cardBorder, minHeight: 90 },
  specLabel: { color: THEME.textDim, fontSize: 10, marginTop: 'auto' },
  specValue: { color: 'white', fontWeight: 'bold', fontSize: 13, marginTop: 2 },

  // Alerts
  alertCard: { width: 140, backgroundColor: THEME.card, marginRight: 12, padding: 16, borderRadius: 16, borderTopWidth: 4 },
  alertTitle: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  alertValue: { fontSize: 18, fontWeight: '800', marginVertical: 4 },
  alertSub: { color: THEME.textDim, fontSize: 10 },

  // Logs
  logRow: { flexDirection: 'row', marginBottom: 20 },
  logTimelineLine: { width: 2, backgroundColor: THEME.cardBorder, position: 'absolute', left: 15, top: 0, bottom: -20 },
  logIconParams: { width: 32, height: 32, borderRadius: 16, backgroundColor: THEME.bg, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  logContent: { flex: 1, marginLeft: 12, backgroundColor: THEME.card, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: THEME.cardBorder },
  logTitle: { color: 'white', fontWeight: 'bold' },
  logDate: { color: THEME.textDim, fontSize: 10 },
  logNotes: { color: THEME.textDim, fontSize: 12, marginVertical: 4 },
  logMeta: { color: THEME.primary, fontSize: 10, fontWeight: 'bold' },
  logCost: { color: THEME.success, fontSize: 12, fontWeight: 'bold' },

  // Tab Bar
  tabBarContainer: { position: 'absolute', bottom: 30, left: 20, right: 20, height: 70 },
  tabBar: { flex: 1, flexDirection: 'row', backgroundColor: '#1e293bE6', borderRadius: 35, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  tabLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  fab: { position: 'absolute', top: -25, left: '50%', marginLeft: -30, width: 60, height: 60, borderRadius: 30, shadowColor: THEME.primary, shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: {width:0,height:5}, elevation: 10 },
  fabGradient: { width: '100%', height: '100%', borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: THEME.bg },

  // Forms
  input: { backgroundColor: THEME.card, color: 'white', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: THEME.cardBorder },
  inpLabel: { color: THEME.textDim, fontSize: 10, fontWeight: 'bold', marginBottom: 8 },
  mainBtn: { backgroundColor: THEME.primary, padding: 18, borderRadius: 16, alignItems: 'center' },
  btnTxt: { fontWeight: 'bold', color: 'black' },
  
  // Vault
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.card, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: THEME.cardBorder },
  docIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  docTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  docSub: { color: THEME.textDim, fontSize: 12 },
  dashedBtn: { borderWidth: 2, borderColor: THEME.cardBorder, borderStyle: 'dashed', borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 10 },

  // Config
  pageTitle: { fontSize: 28, fontWeight: '900', color: 'white', marginBottom: 4 },
  pageSub: { color: THEME.textDim, marginBottom: 24 },
  configSection: { backgroundColor: THEME.card, borderRadius: 16, padding: 16, marginBottom: 20 },
  configHeader: { color: THEME.textDim, fontSize: 10, fontWeight: 'bold', marginBottom: 12 },
  configRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  configLabel: { color: 'white' },
  configValue: { color: THEME.textDim },
  dangerBtn: { backgroundColor: 'rgba(248, 113, 113, 0.2)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 16 },

  // Modals
  modalBase: { flex: 1, paddingTop: 60 },
  modalHeader: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalH1: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 40 },
  modalPopup: { backgroundColor: THEME.bg, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: THEME.cardBorder },
  popupTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  popupBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' }
});
