import React from 'react';
import { StyleSheet } from 'react-native';

export const LIGHT_THEME = {
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

export const DARK_THEME = {
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

export const ThemeContext = React.createContext({
  theme: LIGHT_THEME,
  statusBarStyle: 'dark' as 'light' | 'dark',
});

export const StylesContext = React.createContext<ReturnType<typeof createStyles> | null>(null);

export const useTheme = () => React.useContext(ThemeContext);
export const useStyles = () => {
  const ctx = React.useContext(StylesContext);
  return ctx || createStyles(LIGHT_THEME);
};

export const createStyles = (theme: typeof LIGHT_THEME) =>
  StyleSheet.create({
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
    projectListItem: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.card, marginBottom: 12 },
    projectRow: { flexDirection: 'row', alignItems: 'stretch' },
    projectStatusStrip: { width: 4, borderRadius: 4 },
    projectContent: { flex: 1, marginLeft: 12 },
    projectTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    projectBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 },
    tabBarRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
    tabPill: { flex: 1, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.surface, alignItems: 'center' },
    tabPillText: { color: theme.text, fontWeight: '600', fontSize: 12 },
    sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheetContainer: { backgroundColor: theme.card, paddingTop: 12, paddingBottom: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.cardBorder, alignSelf: 'center', marginBottom: 8 },
    sheetItem: { alignItems: 'center' },
    sheetPrimaryBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, marginBottom: 10 },
    sheetPrimaryText: { color: 'white', fontSize: 16, fontWeight: '700' },
    sheetDangerBtn: { backgroundColor: theme.surface, borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: theme.cardBorder },
    sheetDangerText: { color: theme.danger, fontSize: 16, fontWeight: '700' },
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
    headerIconBtnGhost: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', justifyContent: 'center' },
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
