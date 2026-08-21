// src/components/ui/Layout.tsx
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export const Layout = () => {
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="relative min-h-screen text-white font-sans bg-[#0A0A0A]">
      <div 
        className="fixed inset-0 z-0 pointer-events-none" 
        style={{ backgroundImage: 'radial-gradient(circle, #222 1px, transparent 1px)', backgroundSize: '20px 20px' }} 
      />

      <div className="relative z-10 flex h-screen overflow-hidden">
        <aside className="w-64 bg-[#0A0A0A]/40 backdrop-blur-xl border-r border-[#2A2A2A]/50 hidden md:flex flex-col z-20 shadow-2xl">
          <div className="p-6">
            <h1 className="text-2xl font-extrabold tracking-tight">UPPETIT</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Админ-панель</p>
          </div>
          <nav className="flex-1 px-4 space-y-2 mt-4">
            <Link 
              to="/dashboard" 
              className={`block px-4 py-3 rounded-xl transition-all duration-300 ${location.pathname === '/dashboard' ? 'bg-[#EA580C]/80 backdrop-blur-md text-white font-semibold shadow-lg shadow-orange-900/20 border border-[#F97316]/30' : 'text-gray-400 hover:bg-white/5 hover:backdrop-blur-md'}`}
            >Устройства</Link>
            <Link 
              to="/playlists" 
              className={`block px-4 py-3 rounded-xl transition-all duration-300 ${location.pathname === '/playlists' ? 'bg-[#EA580C]/80 backdrop-blur-md text-white font-semibold shadow-lg shadow-orange-900/20 border border-[#F97316]/30' : 'text-gray-400 hover:bg-white/5 hover:backdrop-blur-md'}`}
            >Плейлисты</Link>
          </nav>

          {/* Кнопка выхода в самом низу сайдбара */}
          <div className="p-4 border-t border-[#2A2A2A]/50">
            <button 
              onClick={logout}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              <LogOut size={18} /> Выйти
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-8 relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};