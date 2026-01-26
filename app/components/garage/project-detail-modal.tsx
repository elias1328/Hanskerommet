import React from 'react';
import {
  Animated,
  ImageBackground,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useStyles, useTheme } from './theme';

export const ProjectDetailModal = ({
  project,
  logs,
  media,
  allLogMedia,
  goals,
  onClose,
  onAddLog,
  onAddImage,
  onDelete,
  onOpenImage,
  onComplete,
  onReopen,
  onOpenGrid,
  onAddGoal,
  onEditGoal,
  onToggleGoal,
  onDeleteGoal,
  onEditProject,
  units,
  formatDistance,
  formatProjectStatusLabel,
}: any) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const [showActions, setShowActions] = React.useState(false);
  const createdAt = (project as any)?.createdAt ?? project?.updatedAt;
  const totalCost = logs.reduce((sum: number, l: any) => sum + (l.cost || 0), 0);
  const budgetProgress =
    project?.budgetPlanned && project.budgetPlanned > 0 ? Math.min(totalCost / project.budgetPlanned, 1) : 0;
  const goalDoneCount = goals.filter((g: any) => g.status === 'done').length;
  const goalTotalCount = goals.length;
  const goalProgress = goalTotalCount ? Math.min(goalDoneCount / goalTotalCount, 1) : 0;
  const lastLogDate = logs.length ? new Date(logs[0].date).toLocaleDateString() : 'Ingen';
  const sortedGoals = [...goals].sort((a: any, b: any) => {
    if (a.status === b.status) return 0;
    return a.status === 'done' ? 1 : -1;
  });
  const nextGoal = sortedGoals.find((g: any) => g.status !== 'done') || null;
  const actionsY = React.useRef(new Animated.Value(300)).current;
  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 12,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 80) {
            onClose?.();
          }
        },
      }),
    [onClose]
  );
  const openActionsSheet = () => {
    setShowActions(true);
    actionsY.setValue(300);
    Animated.timing(actionsY, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  };
  const closeActionsSheet = () => {
    Animated.timing(actionsY, { toValue: 300, duration: 180, useNativeDriver: true }).start(() => {
      setShowActions(false);
    });
  };
  const openProjectActions = () => {
    openActionsSheet();
  };
  if (!project) return null;
  const nextActionLabel = project.status !== 'done' ? 'Merk som fullført' : 'Gjenåpne prosjekt';

  return (
    <View style={[styles.modalBase, { backgroundColor: theme.bg }]} {...panResponder.panHandlers}>
      <View style={styles.modalHeader}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={onClose} accessibilityLabel="Lukk prosjekt">
          <Feather name="chevron-left" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.modalH1}>{project.title}</Text>
        <TouchableOpacity onPress={openProjectActions} accessibilityLabel="Prosjektmeny">
          <Feather name="more-horizontal" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.logForm}>
        <View style={styles.projectHeroCard}>
          <View style={styles.projectHeroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.projectHeroLabel}>Prosjekt</Text>
              <Text style={styles.projectHeroTitle}>{project.title}</Text>
              <Text style={styles.projectHeroMeta}>
                {formatProjectStatusLabel(project.status)} · Oppdatert {new Date(project.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <View
              style={[
                styles.projectStatusPill,
                { backgroundColor: project.status === 'done' ? theme.success : theme.primary },
              ]}
            >
              <Text style={styles.projectStatusPillText}>{formatProjectStatusLabel(project.status)}</Text>
            </View>
          </View>
          {!!project.description && <Text style={styles.projectHeroDesc}>{project.description}</Text>}

          {nextGoal ? (
            <TouchableOpacity style={styles.nextGoalPill} onPress={() => onEditGoal(nextGoal)}>
              <Feather name="flag" size={16} color={theme.textDim} />
              <Text style={styles.nextGoalText}>Neste mål: {nextGoal.title}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.nextGoalPill}>
              <Feather name="flag" size={16} color={theme.textDim} />
              <Text style={styles.nextGoalText}>Legg til mål for å holde oversikt</Text>
            </View>
          )}

          <View style={styles.projectHeroActions}>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={onAddLog}>
              <Text style={styles.btnTxt}>Legg til logg</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => onAddImage('library')}>
              <Text style={{ color: theme.text, fontWeight: '600' }}>Legg til bilder</Text>
            </TouchableOpacity>
          </View>
          {(!project.budgetPlanned || project.budgetPlanned <= 0) && (
            <TouchableOpacity style={styles.inlineCta} onPress={onEditProject}>
              <Feather name="tag" size={16} color={theme.primary} />
              <Text style={styles.inlineCtaText}>Legg til budsjett</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Totalt brukt</Text>
            <Text style={styles.statValue}>{totalCost} kr</Text>
            <Text style={styles.statSub}>Siste oppdatering {new Date(project.updatedAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Logger</Text>
            <Text style={styles.statValue}>{logs.length}</Text>
            <Text style={styles.statSub}>Sist logget {lastLogDate}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Mål fullført</Text>
            <Text style={styles.statValue}>
              {goalTotalCount ? `${goalDoneCount}/${goalTotalCount}` : '—'}
            </Text>
            {goalTotalCount ? null : <Text style={styles.statSub}>Ingen mål lagt til</Text>}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={styles.statValue}>{formatProjectStatusLabel(project.status)}</Text>
            <Text style={styles.statSub}>Opprettet {new Date(createdAt).toLocaleDateString()}</Text>
          </View>
        </View>

        {project.budgetPlanned && project.budgetPlanned > 0 ? (
          <View style={styles.budgetCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>Budsjett</Text>
              <TouchableOpacity style={styles.textButton} onPress={onEditProject}>
                <Text style={styles.textButtonText}>Rediger</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.budgetBarTrack}>
              <View style={[styles.budgetBarFill, { width: `${budgetProgress * 100}%` }]} />
            </View>
            <View style={styles.budgetMetaRow}>
              <Text style={styles.projectMeta}>{totalCost} kr brukt</Text>
              <Text style={styles.projectMeta}>{project.budgetPlanned} kr planlagt</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.formSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Mål</Text>
            {goalTotalCount > 0 ? (
              <TouchableOpacity style={styles.primaryBtnSmall} onPress={onAddGoal}>
                <Text style={styles.btnTxt}>Legg til</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {sortedGoals.length ? (
            <>
              <View style={styles.goalProgressRow}>
                <View style={styles.budgetBarTrack}>
                  <View style={[styles.budgetBarFill, { width: `${goalProgress * 100}%` }]} />
                </View>
                <Text style={styles.projectMeta}>{goalDoneCount}/{goalTotalCount} fullført</Text>
              </View>
              {sortedGoals.map((goal: any) => {
                const hasMeta = !!goal.dueDate || !!goal.notes;
                const isDone = goal.status === 'done';
                return (
                  <View key={goal.id} style={[styles.goalRow, isDone && styles.goalRowDone]}>
                    <TouchableOpacity style={styles.goalCheck} onPress={() => onToggleGoal(goal)}>
                      <View style={[styles.goalCheckBox, isDone && styles.goalCheckBoxDone]}>
                        {isDone ? <Feather name="check" size={14} color="#0F172A" /> : null}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.goalContent} onPress={() => onEditGoal(goal)}>
                      <Text style={[styles.goalTitle, isDone && styles.goalTitleDone]}>
                        {goal.title}
                      </Text>
                      {hasMeta ? (
                        <Text style={styles.goalMeta}>
                          {goal.dueDate ? `Frist ${new Date(goal.dueDate).toLocaleDateString()}` : 'Ingen frist'}
                          {goal.notes ? ` · ${goal.notes}` : ''}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.goalDelete} onPress={() => onDeleteGoal(goal)}>
                      <Feather name="trash-2" size={16} color={theme.textDim} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.pageTitleSmall}>Ingen mål lagt til</Text>
              <Text style={styles.projectMeta}>Legg inn små delmål for å holde oversikt.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={onAddGoal}>
                <Text style={styles.btnTxt}>Legg til mål</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Bilder</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => onAddImage('library')}>
              <Text style={styles.btnTxt}>Legg til bilder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={onOpenGrid}>
              <Text style={{ color: theme.text, textAlign: 'center' }}>Vis alle</Text>
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
            {![...media, ...allLogMedia].length && <Text style={{ color: theme.textDim }}>Ingen bilder ennå.</Text>}
          </ScrollView>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Logger</Text>
          {logs.map((log: any) => (
            <View key={log.id} style={styles.projectListItem}>
              <View style={styles.projectTopRow}>
                <Text style={styles.pageTitleSmall}>{log.title}</Text>
                <Text style={styles.projectMeta}>{log.date}</Text>
              </View>
              <Text style={styles.projectStats}>
                {log.cost} kr {log.mileage ? `• ${formatDistance(log.mileage, units)}` : ''}
              </Text>
              {allLogMedia.filter((m: any) => m.logId === log.id).length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                  {allLogMedia
                    .filter((m: any) => m.logId === log.id)
                    .map((m: any) => (
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
          {!logs.length && <Text style={{ color: theme.textDim }}>Ingen logger ennå.</Text>}
        </View>
      </ScrollView>
      <Modal visible={showActions} transparent animationType="none" onRequestClose={closeActionsSheet}>
        <Pressable style={styles.sheetOverlay} onPress={closeActionsSheet}>
          <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: actionsY }] }]}
          >
            <View style={styles.sheetHandle} />
            <TouchableOpacity
              style={[styles.sheetItem, styles.sheetPrimaryBtn]}
              onPress={() => {
                closeActionsSheet();
                if (project.status !== 'done') {
                  onComplete(project.id);
                } else {
                  onReopen(project.id);
                }
              }}
            >
              <Text style={styles.sheetPrimaryText}>{nextActionLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetItem, styles.sheetPrimaryBtn]}
              onPress={() => {
                closeActionsSheet();
                onEditProject();
              }}
            >
              <Text style={styles.sheetPrimaryText}>Rediger prosjekt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetItem, styles.sheetDangerBtn]}
              onPress={() => {
                closeActionsSheet();
                onDelete(project);
              }}
            >
              <Text style={styles.sheetDangerText}>Slett prosjekt</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
};

export const GoalFormModal = ({
  visible,
  goal,
  onClose,
  onSave,
}: {
  visible: boolean;
  goal: any | null;
  onClose: () => void;
  onSave: (p: { title: string; notes?: string | null; dueDate?: string | null }) => void;
}) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const [title, setTitle] = React.useState(goal?.title || '');
  const [notes, setNotes] = React.useState(goal?.notes || '');
  const [dueDate, setDueDate] = React.useState<Date | null>(goal?.dueDate ? new Date(goal.dueDate) : null);
  const [showPicker, setShowPicker] = React.useState(false);

  React.useEffect(() => {
    setTitle(goal?.title || '');
    setNotes(goal?.notes || '');
    setDueDate(goal?.dueDate ? new Date(goal.dueDate) : null);
  }, [goal]);

  if (!visible) return null;

  return (
    <View style={[styles.modalBase, { backgroundColor: theme.bg }]}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.modalCancelText}>Avbryt</Text>
        </TouchableOpacity>
        <Text style={styles.modalH1}>{goal ? 'Rediger mål' : 'Nytt mål'}</Text>
        <TouchableOpacity
          onPress={() =>
            onSave({
              title,
              notes: notes.trim() || null,
              dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
            })
          }
        >
          <Text style={styles.modalSaveText}>Lagre</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.logForm}>
        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Mål</Text>
          <View style={styles.listGroup}>
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Tittel</Text>
              <TextInput
                style={styles.listInput}
                placeholder="F.eks. bytte bremser"
                placeholderTextColor={theme.textDim}
                value={title}
                onChangeText={setTitle}
              />
            </View>
            <View style={styles.listDivider} />
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Notater</Text>
              <TextInput
                style={styles.listInput}
                placeholder="Valgfritt"
                placeholderTextColor={theme.textDim}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
            <View style={styles.listDivider} />
            <TouchableOpacity style={styles.listRow} onPress={() => setShowPicker(true)}>
              <Text style={styles.listLabel}>Frist</Text>
              <Text style={styles.listValue}>{dueDate ? dueDate.toLocaleDateString() : 'Ingen'}</Text>
            </TouchableOpacity>
            {dueDate ? (
              <>
                <View style={styles.listDivider} />
                <TouchableOpacity style={styles.listRow} onPress={() => setDueDate(null)}>
                  <Text style={styles.listLabel}>Fjern frist</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
        {showPicker && (
          <DateTimePicker
            value={dueDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(event, selectedDate) => {
              if (Platform.OS !== 'ios') {
                setShowPicker(false);
              }
              if (event.type === 'dismissed') return;
              if (selectedDate) setDueDate(selectedDate);
            }}
          />
        )}
      </ScrollView>
    </View>
  );
};
