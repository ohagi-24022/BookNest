import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useAppTheme } from '../store/ThemeContext';

type EdgeSwipeBackProps = PropsWithChildren<{
  onBack: () => void;
  style?: StyleProp<ViewStyle>;
}>;

const EDGE_WIDTH = 28;
const CLOSE_DISTANCE = 96;
const CLOSE_VELOCITY = 780;

export function EdgeSwipeBack({ children, onBack, style }: EdgeSwipeBackProps) {
  const { colors } = useAppTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setLeaving(false);
    progress.setValue(0);
  }, [progress]);

  useFocusEffect(
    useCallback(
      () => {
        setLeaving(false);
        progress.stopAnimation();
        progress.setValue(0);
      },
      [progress],
    ),
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX(12)
        .failOffsetY([-16, 16])
        .onBegin(() => {
          if (!leaving) progress.stopAnimation();
        })
        .onUpdate((event) => {
          if (leaving) return;
          progress.setValue(Math.max(0, Math.min(event.translationX / CLOSE_DISTANCE, 1)));
        })
        .onEnd((event) => {
          if (leaving) return;
          const shouldClose =
            event.translationX > CLOSE_DISTANCE || event.velocityX > CLOSE_VELOCITY;

          if (shouldClose) {
            setLeaving(true);
            Animated.timing(progress, {
              duration: 110,
              toValue: 1,
              useNativeDriver: true,
            }).start(() => {
              progress.setValue(0);
              setLeaving(false);
              onBack();
            });
            return;
          }

          Animated.spring(progress, {
            damping: 20,
            stiffness: 220,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        })
        .onFinalize(() => {
          if (leaving) return;
          progress.stopAnimation((value) => {
            if (value > 0 && value < 1) {
              Animated.spring(progress, {
                damping: 20,
                stiffness: 220,
                toValue: 0,
                useNativeDriver: true,
              }).start();
            }
          });
        }),
    [leaving, onBack, progress],
  );

  return (
    <View style={[styles.root, style]}>
      <View style={styles.content}>{children}</View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: progress.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [0, 0.35, 0.9],
            }),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-28, 18],
                }),
              },
            ],
          },
        ]}
      >
        <Ionicons color={colors.text} name="chevron-back" size={22} />
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <View style={styles.edgeArea} />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  indicator: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: '48%',
    width: 42,
    zIndex: 19,
  },
  edgeArea: {
    bottom: 0,
    left: 0,
    pointerEvents: 'box-only',
    position: 'absolute',
    top: 0,
    width: EDGE_WIDTH,
    zIndex: 20,
  },
});
