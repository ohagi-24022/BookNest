import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../store/ThemeContext';

type Option = {
  label: string;
  value: string;
};

type OptionSheetProps = {
  visible: boolean;
  title: string;
  options: Option[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

export function OptionSheet({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: OptionSheetProps) {
  const { colors } = useAppTheme();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {options.map((option) => {
            const selected = option.value === selectedValue;
            return (
              <Pressable
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: selected ? colors.text : colors.border },
                    selected && { backgroundColor: colors.text },
                  ]}
                >
                  <Text style={[styles.checkmark, { color: colors.background }]}>
                    {selected ? '✓' : ''}
                  </Text>
                </View>
                <Text style={[styles.optionText, { color: colors.text }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 8,
    maxWidth: 360,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '100%',
  },
  title: { fontSize: 17, fontWeight: '900', marginBottom: 6 },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 50,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginRight: 12,
    width: 22,
  },
  checkmark: { fontSize: 14, fontWeight: '900' },
  optionText: { fontSize: 15, fontWeight: '700' },
});
