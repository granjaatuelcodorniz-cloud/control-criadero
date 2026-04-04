'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Egg, Clock } from 'lucide-react';

export default function RegistroHuevos() {
  const [huevosRecolectados, setHuevosRecolectados] = useState(0);
  const [huevosFeriles, setHuevosFeriles] = useState(0);
  const [docenasArmadas, setDocenasArmadas] = useState(0);
  const [huevosRotos, setHuevosRotos] = useState(0);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('daily_records')
      .insert({
        date: new Date().toISOString().split('T')[0],
        user_id: user.id,
        huevos_recolectados: huevosRecolectados,
        huevos_fertiles: huevosFeriles,
        docenas_armadas: docenasArmadas,
        huevos_rotos: huevosRotos,
        notas: notas.trim() || null,
        // created_at se genera automáticamente
      });

    if (!error) {
      setSuccess(true);
      // Resetear formulario
      setHuevosRecolectados(0);
      setHuevosFeriles(0);
      setDocenasArmadas(0);
      setHuevosRotos(0);
      setNotas('');

      setTimeout(() => setSuccess(false), 2500);
    } else {
      alert('Error al guardar: ' + error.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image src="/logo.webp" alt="Granja Atuel" width={180} height={60} className="h-12 w-auto" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ControlCriadero</h1>
              <p className="text-sm text-gray-500">Granja Atuel</p>
            </div>
          </div>
          <Link href="/dashboard" className="text-gray-600 hover:text-black flex items-center gap-2">
            ← Volver
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Egg className="w-8 h-8 text-[#f9c74f]" />
          <h1 className="text-3xl font-bold">Registro de Huevos</h1>
        </div>

        <div className="flex items-center gap-2 text-gray-600 mb-8">
          <Clock className="w-5 h-5" />
          <span>{new Date().toLocaleString('es-ES', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</span>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl p-10 space-y-8">
          {/* ... mismo formulario de números ... */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Huevos recolectados</label>
              <input
                type="number"
                value={huevosRecolectados}
                onChange={(e) => setHuevosRecolectados(Math.max(0, Number(e.target.value)))}
                className="w-full text-5xl font-bold text-center border-2 border-gray-200 focus:border-[#f9c74f] rounded-3xl py-8"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Huevos fértiles</label>
              <input
                type="number"
                value={huevosFeriles}
                onChange={(e) => setHuevosFeriles(Math.max(0, Number(e.target.value)))}
                className="w-full text-5xl font-bold text-center border-2 border-gray-200 focus:border-[#f9c74f] rounded-3xl py-8"
                min="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Docenas armadas</label>
              <input
                type="number"
                value={docenasArmadas}
                onChange={(e) => setDocenasArmadas(Math.max(0, Number(e.target.value)))}
                className="w-full text-5xl font-bold text-center border-2 border-gray-200 focus:border-[#f9c74f] rounded-3xl py-8"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Huevos rotos</label>
              <input
                type="number"
                value={huevosRotos}
                onChange={(e) => setHuevosRotos(Math.max(0, Number(e.target.value)))}
                className="w-full text-5xl font-bold text-center border-2 border-gray-200 focus:border-[#f9c74f] rounded-3xl py-8"
                min="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Notas opcionales</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={4}
              className="w-full border-2 border-gray-200 focus:border-[#f9c74f] rounded-3xl p-5 text-lg"
              placeholder="Alguna observación del día..."
            />
          </div>

          {success && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-6 py-4 rounded-2xl text-center font-medium">
              ✅ Registro guardado correctamente
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-6 text-xl font-semibold"
          >
            {loading ? 'Guardando...' : 'Guardar registro de hoy'}
          </button>
        </form>
      </div>
    </div>
  );
}