// src/pages/Login.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { loginSchema, type LoginFormInputs } from '../schemas/validation';
import { useAuthStore } from '../store/authStore';

export const Login = () => {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormInputs) => {
    // ВРЕМЕННАЯ ХАРДКОД-ПРОВЕРКА (Пока нет бэкенда)
    if (data.email === 'admin@uppetit.ru' && data.password === '12345678') {
      login(data.email);
      navigate('/dashboard');
    } else {
      // Если данные не совпали - показываем ошибку под паролем
      setError('password', { 
        type: 'manual', 
        message: 'Неверный email или пароль' 
      });
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundColor: '#0A0A0A',
        backgroundImage: 'radial-gradient(circle, #222 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}
    >
      <div className="max-w-md w-full bg-[#141414]/80 backdrop-blur-xl rounded-2xl p-10 border border-[#2A2A2A] shadow-2xl relative z-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">UPPETIT</h1>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Админ-панель ТВ</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
            <input
              type="email"
              {...register('email')}
              className="w-full bg-[#0A0A0A]/50 border border-[#2A2A2A] rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#F97316] transition-all"
              placeholder="admin@uppetit.ru"
            />
            {errors.email && <p className="mt-1.5 text-sm text-red-500 font-medium">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Пароль</label>
            <input
              type="password"
              {...register('password')}
              className="w-full bg-[#0A0A0A]/50 border border-[#2A2A2A] rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#F97316] transition-all"
              placeholder="••••••••"
            />
            {errors.password && <p className="mt-1.5 text-sm text-red-500 font-medium">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            className="w-full bg-[#EA580C] hover:bg-[#F97316] text-white font-semibold py-3.5 px-4 rounded-xl transition-colors mt-4"
          >
            Войти в систему
          </button>
        </form>
      </div>
    </div>
  );
};