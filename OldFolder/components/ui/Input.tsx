import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { Eye, EyeOff } from 'lucide-react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  isPassword?: boolean;
}

export default function Input({
  label,
  error,
  containerStyle,
  prefix,
  suffix,
  isPassword = false,
  style,
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.focused,
          !!error && styles.hasError,
        ]}
      >
        {prefix && <View style={styles.prefix}>{prefix}</View>}
        <TextInput
          style={[styles.input, !!prefix && styles.inputWithPrefix, style]}
          placeholderTextColor={Colors.textDisabled}
          secureTextEntry={isPassword && !showPassword}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.suffix}
          >
            {showPassword ? (
              <EyeOff size={18} color={Colors.textTertiary} />
            ) : (
              <Eye size={18} color={Colors.textTertiary} />
            )}
          </TouchableOpacity>
        )}
        {!isPassword && suffix && <View style={styles.suffix}>{suffix}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[1],
  },
  label: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    minHeight: 50,
  },
  focused: {
    borderColor: Colors.primary,
  },
  hasError: {
    borderColor: Colors.error,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  inputWithPrefix: {
    paddingLeft: Spacing[2],
  },
  prefix: {
    paddingLeft: Spacing[3],
    justifyContent: 'center',
  },
  suffix: {
    paddingRight: Spacing[3],
    justifyContent: 'center',
  },
  error: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.error,
    marginTop: 2,
  },
});
