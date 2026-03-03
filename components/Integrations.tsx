import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';
import {
  MessageCircle,
  Facebook,
  Workflow,
  Globe,
  CheckCircle2,
  AlertCircle,
  Copy,
  Power,
  Bot,
  Trash2,
  Settings2,
  Smartphone,
  QrCode,
  Brain,
  Sparkles,
  Zap,
  Crown,
  Gift
} from 'lucide-react';
import { useNotification } from './NotificationContext';
import { evolutionService } from '../services/evolutionService';
import ConfirmationModal from './ConfirmationModal';

interface IntegrationItem {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
  bgColor: string;
  status: 'active' | 'inactive';
  configField: string;
  value: string;
}

const Integrations: React.FC = () => {
  const { addNotification } = useNotification();
  const [copySuccess, setCopySuccess] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [waConfig, setWaConfig] = useState<{ status: string, qr_code?: string } | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  // AI Configuration state
  const [aiConfig, setAiConfig] = useState({
    openaiApiKey: '',
    groqApiKey: '',
    defaultProvider: 'groq_free'
  });

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('inmocrm_user') || 'null');
    setCurrentUser(user);
    if (user?.organizationId) {
      loadWaConfig(user.organizationId);
    }
  }, []);

  const loadWaConfig = async (orgId: string) => {
    const { data } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (data) setWaConfig(data);
  };

  useEffect(() => {
    if (!currentUser?.organizationId) return;

    const channel = supabase
      .channel('public:whatsapp_config_integrations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_config'
        },
        (payload) => {
          const config = payload.new as any;
          if (config.organization_id === currentUser.organizationId) {
            setWaConfig(config);
            if (config.status === 'connected') {
              addNotification({ title: 'WhatsApp Conectado', message: 'Conexión exitosa', type: 'success' });
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  const [integrationList, setIntegrationList] = useState<IntegrationItem[]>([
    {
      id: 'whatsapp_master',
      name: 'WhatsApp Directo (Evolution API)',
      description: 'Vincula tu cuenta de WhatsApp mediante Evolution API para una experiencia profesional y multi-instancia.',
      icon: Smartphone,
      color: 'text-green-600',
      bgColor: 'bg-green-600/10',
      status: 'active',
      configField: 'Estado de Conexión',
      value: 'Pendiente de vinculación'
    }
  ]);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [evoConfig, setEvoConfig] = useState({
    apiUrl: '',
    apiKey: '',
    instanceName: ''
  });

  useEffect(() => {
    if (waConfig) {
      setEvoConfig({
        apiUrl: (waConfig as any).evolution_api_url || '',
        apiKey: (waConfig as any).evolution_api_key || '',
        instanceName: (waConfig as any).instance_name || ''
      });
      setWebhookUrl((waConfig as any).webhook_url || '');
      setAiConfig({
        openaiApiKey: (waConfig as any).openai_api_key || '',
        groqApiKey: (waConfig as any).groq_api_key || '',
        defaultProvider: (waConfig as any).default_ai_provider || 'groq_free'
      });
    }
  }, [waConfig]);

  const saveAiConfig = async () => {
    if (!currentUser?.organizationId) return;

    const { error } = await supabase.from('whatsapp_config').upsert({
      organization_id: currentUser.organizationId,
      openai_api_key: aiConfig.openaiApiKey.trim(),
      groq_api_key: aiConfig.groqApiKey.trim(),
      default_ai_provider: aiConfig.defaultProvider,
      updated_at: new Date().toISOString()
    }, { onConflict: 'organization_id' });

    if (error) {
      addNotification({ title: 'Error', message: error.message, type: 'error' });
    } else {
      addNotification({ title: 'Configuración de IA Guardada', message: 'API Keys actualizadas.', type: 'success' });
      loadWaConfig(currentUser.organizationId);
    }
  };

  const saveEvoConfig = async () => {
    if (!currentUser?.organizationId) return;

    const trimmedUrl = evoConfig.apiUrl.trim().replace(/\/$/, '');
    const trimmedKey = evoConfig.apiKey.trim();
    const trimmedName = evoConfig.instanceName.trim();

    const { error } = await supabase.from('whatsapp_config').upsert({
      organization_id: currentUser.organizationId,
      evolution_api_url: trimmedUrl,
      evolution_api_key: trimmedKey,
      instance_name: trimmedName,
      webhook_url: webhookUrl.trim(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'organization_id' });

    if (error) {
      addNotification({ title: 'Error', message: error.message, type: 'error' });
    } else {
      addNotification({ title: 'Configuración Guardada', message: 'Datos actualizados.', type: 'success' });
      setEvoConfig({ apiUrl: trimmedUrl, apiKey: trimmedKey, instanceName: trimmedName });
      loadWaConfig(currentUser.organizationId);
    }
  };

  const registerWebhook = async () => {
    if (!currentUser?.organizationId || !webhookUrl.trim()) {
      addNotification({ title: 'Faltan datos', message: 'Ingresa una URL de webhook válida.', type: 'warning' });
      return;
    }

    try {
      addNotification({ title: 'Configurando Webhook', message: 'Enviando comando a Evolution API...', type: 'info' });
      const res = await evolutionService.setWebhook(currentUser.organizationId, webhookUrl.trim());

      if (res.error) throw new Error(res.error);

      addNotification({ title: 'Webhook Registrado', message: 'Ahora recibirás mensajes entrantes.', type: 'success' });
    } catch (error: any) {
      addNotification({ title: 'Error Webhook', message: error.message, type: 'error' });
    }
  };

  const generateQr = async () => {
    if (!currentUser?.organizationId) return;
    setIsGeneratingQr(true);
    setQrCode(null);
    setShowQrModal(true);
    setDebugLog(["[Info] Iniciando proceso de conexión..."]);

    const addLog = (msg: string) => setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

    try {
      addLog(`Consultando instancia: ${evoConfig.instanceName}`);
      let code = await evolutionService.getQrCode(currentUser.organizationId);

      if (code && (code as any).error) {
        const errorMsg = String((code as any).error).toLowerCase();
        addLog(`Respuesta: ${errorMsg}`);

        if (errorMsg.includes('unauthorized')) {
          throw new Error('No autorizado. Revisa tu Global API Key.');
        }

        if (errorMsg.includes('not found') || errorMsg.includes('found')) {
          addLog("Instancia no encontrada. Intentando crear...");
          const createRes = await evolutionService.createInstance(currentUser.organizationId);
          if (createRes.error) {
            addLog(`Error al crear: ${createRes.error}`);
            throw new Error(`Error al crear instancia: ${createRes.error}`);
          }
          addLog("Instancia creada. Esperando QR...");
          await new Promise(r => setTimeout(r, 4000));
          code = await evolutionService.getQrCode(currentUser.organizationId);
        } else if (errorMsg.includes('already connected')) {
          addNotification({ title: 'Ya Conectado', message: 'WhatsApp ya está vinculado correctamente.', type: 'success' });
          setShowQrModal(false);
          loadWaConfig(currentUser.organizationId);
          return;
        } else {
          throw new Error((code as any).error);
        }
      }

      if (code && typeof code === 'string') {
        addLog("¡QR recibido!");
        setQrCode(code);
      } else {
        throw new Error('No se pudo obtener el QR. Revisa el log de abajo.');
      }
    } catch (error: any) {
      addLog(`ERROR: ${error.message}`);
      addNotification({ title: 'Error', message: error.message, type: 'error' });
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const checkConnectionStatus = async () => {
    if (!currentUser?.organizationId) return;
    try {
      const isConnected = await evolutionService.checkConnection(currentUser.organizationId);
      if (isConnected) {
        const { error } = await supabase
          .from('whatsapp_config')
          .update({ status: 'connected', updated_at: new Date().toISOString() })
          .eq('organization_id', currentUser.organizationId);

        if (!error) {
          addNotification({ title: 'Conectado', message: 'La instancia está activa.', type: 'success' });
          loadWaConfig(currentUser.organizationId);
        }
      } else {
        addNotification({ title: 'No vinculado', message: 'La instancia no está conectada.', type: 'warning' });
      }
    } catch (error: any) {
      addNotification({ title: 'Error', message: error.message, type: 'error' });
    }
  };

  const handleDisconnect = async () => {
    if (!currentUser?.organizationId) return;

    setConfirmModal({
      isOpen: true,
      title: '¿Desvincular WhatsApp?',
      message: '¿Estás seguro de que deseas desvincular esta instancia? Se perderá la conexión actual.',
      type: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const addLog = (msg: string) => setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
          addLog("Desconectando instancia...");

          await evolutionService.deleteInstance(currentUser!.organizationId);
          await supabase
            .from('whatsapp_config')
            .update({ status: 'disconnected', updated_at: new Date().toISOString() })
            .eq('organization_id', currentUser!.organizationId);

          addNotification({ title: 'Desconectado', message: 'Instancia eliminada.', type: 'success' });
          loadWaConfig(currentUser!.organizationId);
          setQrCode(null);
        } catch (error: any) {
          await supabase
            .from('whatsapp_config')
            .update({ status: 'disconnected', updated_at: new Date().toISOString() })
            .eq('organization_id', currentUser!.organizationId);
          addNotification({ title: 'Aviso', message: 'Limpio estado local. Error API: ' + error.message, type: 'warning' });
          loadWaConfig(currentUser!.organizationId);
        }
      }
    });
  };

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    addNotification({ title: 'Copiado', message: 'URL copiada', type: 'success' });
  };

  return (
    <div className="space-y-4">
      <div className="md:hidden">
        <h2 className="text-main-title font-black text-electric-accent">Integraciones</h2>
        <p className="text-body-secondary text-text-muted font-bold opacity-60">Conexiones externas</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {integrationList.map((item) => (
          <div key={item.id} className="bg-surface/50 border border-border-color rounded-2xl p-5 shadow-xl shadow-black/5 transition-all group overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/40" />
            <div className="flex justify-between items-start mb-5">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border border-current/10 ${item.bgColor} ${item.color} shrink-0 shadow-inner`}>
                  <item.icon size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-main tracking-tight">{item.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${waConfig?.status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></span>
                    <span className="text-[11px] text-text-muted font-bold opacity-60 uppercase tracking-wider">{waConfig?.status === 'connected' ? 'Servicio Activo' : 'Desconectado'}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleDisconnect} className="w-8 h-8 flex items-center justify-center rounded-xl text-text-muted hover:text-danger hover:bg-danger/10 transition-all active:scale-95" title="Eliminar configuración">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <p className="text-text-muted text-[11px] mb-5 font-medium opacity-70 leading-relaxed">{item.description}</p>

            <div className="bg-surface border border-border-color rounded-[1.5rem] p-4 space-y-3.5 shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.15em] opacity-40">Estado del servicio</span>
                <span className={`${waConfig?.status === 'connected' ? 'text-green-500' : 'text-amber-500'} text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-background/50 px-3 py-1 rounded-full border border-current/10`}>
                  {waConfig?.status === 'connected' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  {waConfig?.status === 'connected' ? 'Conectado' : 'Pendiente'}
                </span>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-muted/80 pl-1 uppercase tracking-wider">Dirección API (Evolution)</label>
                  <input
                    type="text"
                    className="w-full bg-input-bg border border-border-color rounded-xl px-3.5 py-1.5 text-xs font-bold text-text-main outline-none focus:border-primary shadow-inner transition-all tracking-tight"
                    placeholder="https://api.vuestra-instancia.com"
                    value={evoConfig.apiUrl}
                    onChange={e => setEvoConfig({ ...evoConfig, apiUrl: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted/80 pl-1 uppercase tracking-wider">Global API Key</label>
                    <input
                      type="password"
                      className="w-full bg-input-bg border border-border-color rounded-xl px-3.5 py-1.5 text-xs font-bold text-text-main outline-none focus:border-primary shadow-inner transition-all tracking-tight"
                      placeholder="••••••••••••"
                      value={evoConfig.apiKey}
                      onChange={e => setEvoConfig({ ...evoConfig, apiKey: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted/80 pl-1 uppercase tracking-wider">Instancia</label>
                    <input
                      type="text"
                      className="w-full bg-input-bg border border-border-color rounded-xl px-3.5 py-1.5 text-xs font-bold text-text-main outline-none focus:border-primary shadow-inner transition-all tracking-tight"
                      placeholder="Nombre"
                      value={evoConfig.instanceName}
                      onChange={e => setEvoConfig({ ...evoConfig, instanceName: e.target.value })}
                    />
                  </div>
                </div>
                <button
                  onClick={saveEvoConfig}
                  className="w-full bg-primary hover:bg-primary/95 text-white py-3 rounded-xl text-xs font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  Confirmar credenciales
                </button>

                <div className="pt-4 border-t border-border-color space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.15em] opacity-40">Configuración Webhook</span>
                    <Globe size={14} className="text-primary opacity-50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-muted/80 pl-1 uppercase tracking-wider">URL de eventos (pública)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-input-bg border border-border-color rounded-xl px-3.5 py-1.5 text-xs font-bold text-text-main outline-none focus:border-primary shadow-inner transition-all tracking-tight"
                        placeholder="https://tu-tunel.app/webhook"
                        value={webhookUrl}
                        onChange={e => setWebhookUrl(e.target.value)}
                      />
                      <button
                        onClick={registerWebhook}
                        className="px-4 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-xs font-bold transition-all active:scale-95 border border-border-color"
                      >
                        Activar
                      </button>
                    </div>
                    <p className="text-[9px] text-text-muted mt-1.5 font-bold opacity-30 italic">
                      Ruta recomendada: /webhook/evolution
                    </p>
                  </div>
                </div>

                <div className="pt-1.5 flex items-center gap-2">
                  <div className="flex-1 bg-input-bg border border-border-color rounded-xl px-3.5 py-1.5 text-xs font-bold text-text-muted shadow-inner opacity-60 flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${waConfig?.status === 'connected' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    {waConfig?.status === 'connected' ? 'WhatsApp Vinculado' : 'Esperando Sincronización'}
                  </div>
                  <button
                    onClick={generateQr}
                    className="w-10 h-10 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95 flex items-center justify-center"
                    title="Vincular con QR"
                  >
                    <QrCode size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* AI Configuration Card */}
        <div className="bg-surface/50 border border-border-color rounded-2xl p-5 shadow-xl shadow-black/5 transition-all group overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />
          <div className="flex justify-between items-start mb-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10 text-primary border border-primary/10 shrink-0 shadow-inner">
                <Brain size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-main tracking-tight">Cerebro AI</h3>
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-primary/60" />
                  <span className="text-[11px] text-text-muted font-bold opacity-60 uppercase tracking-wider">Motor de análisis activo</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border-color rounded-[1.5rem] p-4 space-y-4 shadow-sm relative overflow-hidden">
            {/* Default AI Provider */}
            <div className="space-y-2.5">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-[0.15em] opacity-40">Proveedor preferido</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAiConfig({ ...aiConfig, defaultProvider: 'openai' })}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-bold transition-all ${aiConfig.defaultProvider === 'openai' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-input-bg border border-border-color text-text-muted hover:border-amber-500'}`}
                >
                  <Crown size={14} /> OpenAI
                </button>
                <button
                  onClick={() => setAiConfig({ ...aiConfig, defaultProvider: 'groq_pro' })}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-bold transition-all ${aiConfig.defaultProvider === 'groq_pro' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-input-bg border border-border-color text-text-muted hover:border-primary'}`}
                >
                  <Zap size={14} /> Groq Pro
                </button>
                <button
                  onClick={() => setAiConfig({ ...aiConfig, defaultProvider: 'groq_free' })}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-bold transition-all ${aiConfig.defaultProvider === 'groq_free' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-input-bg border border-border-color text-text-muted hover:border-emerald-500'}`}
                >
                  <Gift size={14} /> Groq Free
                </button>
              </div>
            </div>

            {/* OpenAI API Key */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-text-muted/80 pl-1 uppercase tracking-wider flex items-center gap-2">
                <Crown size={10} className="text-amber-500" /> OpenAI API key
              </label>
              <input
                type="password"
                className="w-full bg-input-bg border border-border-color rounded-xl px-3.5 py-1.5 text-xs font-bold text-text-main outline-none focus:border-amber-500 shadow-inner transition-all tracking-tight"
                placeholder="sk-••••••••••••••••••••••••••••"
                value={aiConfig.openaiApiKey}
                onChange={e => setAiConfig({ ...aiConfig, openaiApiKey: e.target.value })}
              />
            </div>

            {/* Groq API Key */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-text-muted/80 pl-1 uppercase tracking-wider flex items-center gap-2">
                <Zap size={10} className="text-primary" /> Groq API key
              </label>
              <input
                type="password"
                className="w-full bg-input-bg border border-border-color rounded-xl px-3.5 py-1.5 text-xs font-bold text-text-main outline-none focus:border-primary shadow-inner transition-all tracking-tight"
                placeholder="gsk_••••••••••••••••••••••••••••"
                value={aiConfig.groqApiKey}
                onChange={e => setAiConfig({ ...aiConfig, groqApiKey: e.target.value })}
              />
            </div>

            <button onClick={saveAiConfig} className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-primary/10 flex items-center justify-center gap-2 transition-all active:scale-95 border-t border-white/10">
              <Sparkles size={16} /> Sincronizar IA
            </button>
          </div>
        </div>
      </div>

      {/* QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-surface border border-border-color rounded-[2.5rem] w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-primary" />

            <h3 className="text-xl font-bold text-text-main mb-1 tracking-tight">Vincular WhatsApp</h3>
            <p className="text-[10px] text-text-muted font-bold opacity-60 uppercase tracking-[0.2em] mb-6">Evolution API Instance</p>

            <div className="bg-white p-5 rounded-2xl inline-block shadow-inner mb-6 mx-auto border-4 border-border-color relative">
              {isGeneratingQr ? (
                <div className="w-48 h-48 flex flex-col items-center justify-center text-primary/40 gap-4">
                  <div className="w-12 h-12 border-4 border-border-color border-t-primary rounded-full animate-spin"></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Generando...</span>
                </div>
              ) : qrCode ? (
                <div className="relative group">
                  {qrCode.startsWith('data:image') ? (
                    <img src={qrCode} alt="QR" className="w-[192px] h-[192px] rounded-lg" />
                  ) : (
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`} alt="QR" className="w-[192px] h-[192px] rounded-lg" />
                  )}
                  <div className="absolute inset-0 bg-primary/5 rounded-lg pointer-events-none group-hover:bg-transparent transition-all" />
                </div>
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-text-muted/30 italic text-xs font-medium">Esperando QR...</div>
              )}
            </div>

            <div className="space-y-4 mb-6">
              {waConfig?.status === 'connected' && (
                <div className="py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-600 text-[10px] font-black uppercase tracking-wider shadow-inner">
                  ✅ Sesión Activa y Sincronizada
                </div>
              )}

              <button
                onClick={handleDisconnect}
                className="w-full py-2.5 text-danger hover:bg-danger/5 text-[10px] font-black uppercase tracking-widest rounded-xl border border-danger/10 transition-all active:scale-95"
              >
                Cerrar sesión / Reset
              </button>

              {debugLog.length > 0 && (
                <div className="bg-input-bg border border-border-color rounded-2xl p-4 text-[9px] font-mono h-24 overflow-y-auto space-y-1.5 text-left shadow-inner custom-scrollbar">
                  <div className="text-[8px] font-black text-text-muted/40 uppercase tracking-widest border-b border-border-color/10 pb-2 mb-2">Logs de sistema</div>
                  {debugLog.map((log, i) => (
                    <div key={i} className={`leading-relaxed ${log.includes('ERROR') ? 'text-red-500' : (log.includes('Respuesta') ? 'text-primary' : 'text-text-muted/60')}`}>
                      {log}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={checkConnectionStatus}
                className="w-full py-3 bg-surface border border-border-color text-text-main hover:bg-background rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
              >
                Verificar sincronización
              </button>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-3.5 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95"
            >
              Volver
            </button>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />
    </div>
  );
};

export default Integrations;
