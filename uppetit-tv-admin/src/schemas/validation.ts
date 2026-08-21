// src/schemas/validation.ts
import { z } from 'zod';

// Схема авторизации администратора
export const loginSchema = z.object({
  email: z.string().email("Неверный формат email адреса"),
  password: z.string().min(8, "Пароль должен содержать минимум 8 символов"),
});

export type LoginFormInputs = z.infer<typeof loginSchema>;

// Схема привязки нового телевизора
export const pairDeviceSchema = z.object({
  shortId: z.string()
    .length(7, "ID должен состоять из 7 символов (включая пробел)")
    .regex(/^[A-Z0-9]{3} [A-Z0-9]{3}$/, "Неверный формат ID (ожидается: A8K 2M9)"),
  locationName: z.string().min(3, "Название точки должно быть не менее 3 символов"),
  deviceName: z.string().min(2, "Имя ТВ должно быть не менее 2 символов"),
});

export type PairDeviceInputs = z.infer<typeof pairDeviceSchema>;