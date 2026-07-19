import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAppTheme } from '../store/ThemeContext';

type HeaderBackButtonProps = {
  accessibilityLabel?: string;
  label?: string;
  onPress: () => void;
};

export function HeaderBackButton({
  accessibilityLabel = '戻る',
  label = '戻る',
  onPress,
}: HeaderBackButtonProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={styles.button}
    >
      <Ionicons color={colors.text} name="chevron-back" size={22} />
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingRight: 10 },
  label: { fontSize: 16, fontWeight: '700' },
});
