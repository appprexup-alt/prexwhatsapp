
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Lead, Client, LeadStatus, Property } from '../types';
import {
  Search, Plus, LayoutGrid, List, Phone, Mail,
  MessageCircle, MapPin, Edit, Trash2, Eye, Filter, AlertCircle
} from 'lucide-react';
import { useNotification } from './NotificationContext';
import ConfirmationModal from './ConfirmationModal';

// Unified Type for Display
type UnifiedContact = {
  id: string;
  originalId: string;
  type: 'lead' | 'client';
  name: string;
  phone: string;
  email?: string;
  status: LeadStatus;
  notes?: string;
  sourceOrInterest?: string;
  createdAt?: string;
  interestedPropertyIds?: string[];
};

const Contacts: React.FC = () => {
  const { addNotification } = useNotification();
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('pipeline');
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'lead' | 'client'>('all');

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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

  // Form/Detail State
  const [selectedContact, setSelectedContact] = useState<UnifiedContact | null>(null);
  const [phoneError, setPhoneError] = useState('');

  // Simplified Form State
  const [formData, setFormData] = useState<{
    type: 'lead' | 'client';
    name: string;
    phone: string;
    email: string;
    status: LeadStatus;
    notes: string;
    extraInfo: string; // Source for lead, Origin for client
  }>({
    type: 'lead',
    name: '',
    phone: '',
    email: '',
    status: LeadStatus.NEW,
    notes: '',
    extraInfo: ''
  });

  // Interest Management (for detail view)
  const [propertyToAdd, setPropertyToAdd] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [l, c, p] = await Promise.all([
      db.getLeads(),
      db.getClients(),
      db.getProperties()
    ]);

    const unifiedLeads: UnifiedContact[] = l.map(lead => ({
      id: `lead_${lead.id}`,
      originalId: lead.id,
      type: 'lead',
      name: lead.name,
      phone: lead.phone,
      status: lead.status as LeadStatus,
      sourceOrInterest: lead.interest || lead.source,
      notes: lead.source // Just storing source in notes for display simplicity if needed, or handle separately
    }));

    const unifiedClients: UnifiedContact[] = c.map(client => ({
      id: `client_${client.id}`,
      originalId: client.id,
      type: 'client',
      name: client.name,
      phone: client.phone,
      email: client.email,
      status: (client.status as LeadStatus) || LeadStatus.NEW,
      notes: client.notes,
      sourceOrInterest: client.origin,
      createdAt: client.createdAt,
      interestedPropertyIds: client.interestedPropertyIds
    }));

    setContacts([...unifiedLeads, ...unifiedClients]);
    setProperties(p);
  };

  // Filter Logic
  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm);
    const matchesType = filterType === 'all' || c.type === filterType;
    return matchesSearch && matchesType;
  });

  // Pipeline Columns
  const pipelineColumns = [
    { id: LeadStatus.NEW, label: 'Nuevos', color: 'border-primary' },
    { id: LeadStatus.CONTACTED, label: 'Contactados', color: 'border-secondary' },
    { id: LeadStatus.INTERESTED, label: 'Interesados', color: 'border-amber-500' },
    { id: LeadStatus.QUALIFIED, label: 'Calificados', color: 'border-orange-500' },
    { id: LeadStatus.CLOSED, label: 'Cerrados', color: 'border-green-500' },
    { id: LeadStatus.LOST, label: 'Perdidos', color: 'border-text-muted' },
  ];

  // Handlers
  const openAddModal = () => {
    setFormData({
      type: 'lead',
      name: '',
      phone: '',
      email: '',
      status: LeadStatus.NEW,
      notes: '',
      extraInfo: ''
    });
    setPhoneError('');
    setIsEditing(false);
    setShowAddModal(true);
  };

  const openEditModal = (contact: UnifiedContact) => {
    setFormData({
      type: contact.type,
      name: contact.name,
      phone: contact.phone,
      email: contact.email || '',
      status: contact.status,
      notes: contact.notes || '',
      extraInfo: contact.sourceOrInterest || ''
    });
    setPhoneError('');
    setSelectedContact(contact);
    setIsEditing(true);
    setShowAddModal(true);
  };

  const openDetailModal = (contact: UnifiedContact) => {
    setSelectedContact(contact);
    setShowDetailModal(true);
  };

  const handleDelete = async (contact: UnifiedContact) => {
    setConfirmModal({
      isOpen: true,
      title: '¿Eliminar Contacto?',
      message: `¿Eliminar ${contact.type === 'client' ? 'cliente' : 'lead'} permanentemente?`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        let res;
        if (contact.type === 'lead') {
          res = await db.deleteLead(contact.originalId);
        } else {
          res = await db.deleteClient(contact.originalId);
        }

        if (res?.success) {
          addNotification({ title: 'Contacto Eliminado', message: 'Registro eliminado exitosamente.', type: 'info' });
          loadData();
          setShowDetailModal(false);
        } else {
          addNotification({ title: 'Error', message: res?.message || 'No se pudo eliminar.', type: 'error' });
        }
      }
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.phone) return;

    // Phone Validation
    const phoneRegex = /^\+?[0-9\s-]{7,15}$/;
    if (!phoneRegex.test(formData.phone)) {
      setPhoneError('Número inválido (mín 7 dígitos)');
      return;
    }
    setPhoneError('');

    let res;

    if (formData.type === 'lead') {
      const leadData: Partial<Lead> = {
        name: formData.name,
        phone: formData.phone,
        status: formData.status,
        source: isEditing ? undefined : (formData.extraInfo || 'Manual'), // Preserve source if editing
        interest: formData.extraInfo,
        lastContact: new Date().toISOString()
      };

      if (isEditing && selectedContact?.type === 'lead') {
        res = await db.updateLead({ ...leadData, id: selectedContact.originalId } as Lead);
      } else {
        res = await db.addLead({ ...leadData, id: Math.random().toString(36).substr(2, 9) } as Lead);
      }
    } else {
      // Client
      const clientData: Partial<Client> = {
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        status: formData.status,
        notes: formData.notes,
        origin: (formData.extraInfo as any) || 'WhatsApp'
      };

      if (isEditing && selectedContact?.type === 'client') {
        // Preserve existing data we might not have in form
        const existingClient = await db.getClients().then(cs => cs.find(c => c.id === selectedContact.originalId));
        res = await db.updateClient({ ...existingClient, ...clientData, id: selectedContact.originalId } as Client);
      } else {
        res = await db.addClient({
          ...clientData,
          id: Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString(),
          interestedPropertyIds: []
        } as Client);
      }
    }

    if (res.success) {
      setShowAddModal(false);
      loadData();
      addNotification({ title: 'Guardado', message: 'Contacto actualizado correctamente.', type: 'success' });
    } else {
      addNotification({ title: 'Error', message: res.message || 'Error al guardar.', type: 'error' });
    }
  };

  const handleAddInterest = async () => {
    if (!selectedContact || selectedContact.type !== 'client' || !propertyToAdd) return;
    const allClients = await db.getClients();
    const realClient = allClients.find(c => c.id === selectedContact.originalId);
    if (realClient) {
      const currentInterests = realClient.interestedPropertyIds || [];
      if (!currentInterests.includes(propertyToAdd)) {
        await db.updateClient({ ...realClient, interestedPropertyIds: [...currentInterests, propertyToAdd] });
        const updatedContact = { ...selectedContact, interestedPropertyIds: [...currentInterests, propertyToAdd] };
        setSelectedContact(updatedContact);
        loadData();
      }
    }
    setPropertyToAdd('');
  };

  const handleRemoveInterest = async (propId: string) => {
    if (!selectedContact || selectedContact.type !== 'client') return;
    const allClients = await db.getClients();
    const realClient = allClients.find(c => c.id === selectedContact.originalId);
    if (realClient) {
      const currentInterests = realClient.interestedPropertyIds || [];
      await db.updateClient({ ...realClient, interestedPropertyIds: currentInterests.filter(id => id !== propId) });
      const updatedContact = { ...selectedContact, interestedPropertyIds: currentInterests.filter(id => id !== propId) };
      setSelectedContact(updatedContact);
      loadData();
    }
  };

  const getPropertiesForSelected = () => {
    if (!selectedContact || !selectedContact.interestedPropertyIds) return [];
    return properties.filter(p => selectedContact.interestedPropertyIds!.includes(p.id));
  };

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-text-main">Contactos</h2>
          <p className="text-text-muted">Unifica la gestión de Leads y Clientes</p>
        </div>

        <div className="flex items-center gap-3 bg-card-bg p-1 rounded-xl border border-border-color shadow-sm">
          <button onClick={() => setViewMode('pipeline')} className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${viewMode === 'pipeline' ? 'bg-primary text-white' : 'text-text-muted hover:bg-background'}`}>
            <LayoutGrid size={20} />
            <span className="text-sm font-medium hidden sm:inline">Pipeline</span>
          </button>
          <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'text-text-muted hover:bg-background'}`}>
            <List size={20} />
            <span className="text-sm font-medium hidden sm:inline">Lista</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono..."
            className="w-full bg-input-bg border border-border-color text-text-main rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-primary"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 bg-input-bg rounded-xl border border-border-color p-1">
          <button onClick={() => setFilterType('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === 'all' ? 'bg-primary text-white' : 'text-text-muted hover:text-text-main'}`}>Todos</button>
          <button onClick={() => setFilterType('lead')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === 'lead' ? 'bg-primary text-white' : 'text-text-muted hover:text-text-main'}`}>Leads</button>
          <button onClick={() => setFilterType('client')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === 'client' ? 'bg-primary text-white' : 'text-text-muted hover:text-text-main'}`}>Clientes</button>
        </div>

        <button onClick={openAddModal} className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-primary/20 transition-colors">
          <Plus size={20} />
          <span>Nuevo</span>
        </button>
      </div>

      {/* Views */}
      {viewMode === 'pipeline' ? (
        <div className="flex-1 overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-[1400px] h-full">
            {pipelineColumns.map(col => (
              <div key={col.id} className="flex-1 flex flex-col bg-card-bg/40 rounded-xl border border-border-color min-w-[260px]">
                {/* Column Header */}
                <div className={`p-3 border-t-4 ${col.color} bg-card-bg rounded-t-xl flex justify-between items-center sticky top-0 backdrop-blur-sm`}>
                  <h3 className="font-bold text-text-main text-sm uppercase tracking-wide">{col.label}</h3>
                  <span className="bg-background text-text-muted text-xs px-2 py-0.5 rounded-full font-mono border border-border-color">
                    {filteredContacts.filter(c => c.status === col.id).length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 p-2 overflow-y-auto custom-scrollbar space-y-3">
                  {filteredContacts
                    .filter(c => c.status === col.id)
                    .map(contact => (
                      <div
                        key={contact.id}
                        onClick={() => contact.type === 'client' ? openDetailModal(contact) : openEditModal(contact)}
                        className={`bg-card-bg border p-3 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-all group relative ${contact.type === 'client' ? 'border-primary/50 dark:border-primary/50 bg-primary/5 dark:bg-primary/10' : 'border-border-color'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className={`font-bold text-sm ${contact.type === 'client' ? 'text-primary dark:text-primary-glow' : 'text-text-main'}`}>
                            {contact.name}
                          </h4>
                          {contact.type === 'client' && <span className="text-[10px] bg-primary text-white px-1.5 rounded">CL</span>}
                        </div>

                        <div className="space-y-1.5 mb-3">
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <Phone size={12} /> <span>{contact.phone}</span>
                          </div>
                          {contact.sourceOrInterest && (
                            <div className="text-xs text-text-muted truncate">
                              {contact.sourceOrInterest}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-border-color">
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); openEditModal(contact); }} className="hover:text-primary text-text-muted"><Edit size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(contact); }} className="hover:text-danger text-text-muted"><Trash2 size={14} /></button>
                          </div>
                          <a href={`https://wa.me/${contact.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-green-600 hover:text-green-500">
                            <MessageCircle size={16} />
                          </a>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // LIST VIEW
        <div className="bg-card-bg rounded-xl border border-border-color overflow-hidden flex-1 flex flex-col shadow-sm">
          <div className="overflow-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-background z-10 shadow-sm">
                <tr className="text-text-muted text-sm">
                  <th className="p-4 font-medium border-b border-border-color">Nombre / Tipo</th>
                  <th className="p-4 font-medium border-b border-border-color">Contacto</th>
                  <th className="p-4 font-medium border-b border-border-color">Estado</th>
                  <th className="p-4 font-medium border-b border-border-color">Interés / Origen</th>
                  <th className="p-4 font-medium border-b border-border-color text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {filteredContacts.map(contact => (
                  <tr key={contact.id} className="hover:bg-background/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${contact.type === 'client' ? 'bg-primary text-white' : 'bg-input-bg text-text-main border border-border-color'}`}>
                          {contact.name.charAt(0)}
                        </div>
                        <div>
                          <p className={`font-medium ${contact.type === 'client' ? 'text-primary dark:text-primary-glow' : 'text-text-main'}`}>{contact.name}</p>
                          <span className="text-[10px] uppercase tracking-wider text-text-muted">{contact.type === 'client' ? 'Cliente' : 'Lead'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 text-sm text-text-muted">
                        <span className="flex items-center gap-2"><Phone size={12} /> {contact.phone}</span>
                        {contact.email && <span className="flex items-center gap-2"><Mail size={12} /> {contact.email}</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs border ${contact.status === LeadStatus.CLOSED ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                        contact.status === LeadStatus.NEW ? 'bg-primary/10 text-primary border-primary/20' :
                          'bg-input-bg text-text-muted border-border-color'
                        }`}>
                        {contact.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-text-muted">
                      {contact.sourceOrInterest}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        {contact.type === 'client' && (
                          <button onClick={() => openDetailModal(contact)} className="p-2 hover:text-primary text-text-muted" title="Ver Detalles"><Eye size={18} /></button>
                        )}
                        <button onClick={() => openEditModal(contact)} className="p-2 hover:text-primary text-text-muted" title="Editar"><Edit size={18} /></button>
                        <button onClick={() => handleDelete(contact)} className="p-2 hover:text-danger text-text-muted" title="Eliminar"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card-bg border border-border-color rounded-none md:rounded-2xl w-full md:max-w-md shadow-2xl flex flex-col h-full md:h-auto md:max-h-[90vh]">
            <div className="p-6 border-b border-border-color shrink-0">
              <h3 className="text-xl font-bold text-text-main">{isEditing ? 'Editar Contacto' : 'Nuevo Contacto'}</h3>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {!isEditing && (
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="ctype" checked={formData.type === 'lead'} onChange={() => setFormData({ ...formData, type: 'lead' })} className="accent-primary" />
                    <span className="text-text-main">Lead</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="ctype" checked={formData.type === 'client'} onChange={() => setFormData({ ...formData, type: 'client' })} className="accent-primary" />
                    <span className="text-text-main">Cliente</span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-sm text-text-muted mb-1">Nombre</label>
                <input className="w-full bg-input-bg border border-border-color rounded-lg p-2 text-text-main focus:border-primary outline-none" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Teléfono</label>
                <input
                  className={`w-full bg-input-bg border rounded-lg p-2 text-text-main focus:border-primary outline-none ${phoneError ? 'border-danger' : 'border-border-color'}`}
                  value={formData.phone}
                  onChange={e => { setFormData({ ...formData, phone: e.target.value }); setPhoneError(''); }}
                  placeholder="+51 999 999 999"
                />
                {phoneError && <div className="flex items-center gap-1 mt-1 text-xs text-danger"><AlertCircle size={12} /> {phoneError}</div>}
              </div>

              {formData.type === 'client' && (
                <div>
                  <label className="block text-sm text-text-muted mb-1">Email</label>
                  <input className="w-full bg-input-bg border border-border-color rounded-lg p-2 text-text-main focus:border-primary outline-none" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1">Estado</label>
                  <select className="w-full bg-input-bg border border-border-color rounded-lg p-2 text-text-main focus:border-primary outline-none" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as LeadStatus })}>
                    {Object.values(LeadStatus).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">{formData.type === 'lead' ? 'Fuente / Interés' : 'Origen'}</label>
                  <input className="w-full bg-input-bg border border-border-color rounded-lg p-2 text-text-main focus:border-primary outline-none" value={formData.extraInfo} onChange={e => setFormData({ ...formData, extraInfo: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">Notas</label>
                <textarea className="w-full bg-input-bg border border-border-color rounded-lg p-2 text-text-main h-24 resize-none focus:border-primary outline-none" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
              </div>
            </div>
            <div className="p-6 border-t border-border-color flex justify-end gap-3 bg-background/50 shrink-0 rounded-b-none md:rounded-b-2xl">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-text-muted hover:text-text-main">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* CLIENT DETAILS MODAL */}
      {showDetailModal && selectedContact && selectedContact.type === 'client' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card-bg border border-border-color rounded-none md:rounded-2xl w-full md:max-w-3xl shadow-2xl flex flex-col h-full md:h-auto md:max-h-[90vh]">
            <div className="p-6 border-b border-border-color flex justify-between items-start bg-background/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white font-bold text-2xl shadow-md">
                  {selectedContact.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-text-main flex items-center gap-3">
                    {selectedContact.name}
                    <span className={`text-sm px-2 py-0.5 rounded border ${pipelineColumns.find(c => c.id === selectedContact.status)?.color || 'border-border-color'}`}>
                      {selectedContact.status}
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-text-muted text-sm">
                    <span className="flex items-center gap-1"><Phone size={14} /> {selectedContact.phone}</span>
                    {selectedContact.email && <span className="flex items-center gap-1"><Mail size={14} /> {selectedContact.email}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-text-muted hover:text-text-main p-2"><Eye size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

              {/* Notes Section */}
              <div>
                <h4 className="text-lg font-semibold text-text-main mb-3 flex items-center gap-2">
                  <MessageCircle size={18} className="text-primary" /> Notas
                </h4>
                <div className="bg-input-bg p-4 rounded-xl border border-border-color text-text-main leading-relaxed">
                  {selectedContact.notes || "No hay notas registradas."}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-semibold text-text-main flex items-center gap-2">
                    <MapPin size={18} className="text-primary" /> Propiedades de Interés
                  </h4>
                  <div className="flex gap-2">
                    <select className="bg-input-bg border border-border-color rounded-lg px-3 py-1.5 text-sm text-text-main outline-none focus:border-primary w-48" value={propertyToAdd} onChange={(e) => setPropertyToAdd(e.target.value)}>
                      <option value="">Agregar propiedad...</option>
                      {properties.filter(p => !selectedContact.interestedPropertyIds?.includes(p.id)).map(p => (<option key={p.id} value={p.id}>{p.projectName} - {p.lotNumber}</option>))}
                    </select>
                    <button onClick={handleAddInterest} disabled={!propertyToAdd} className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white p-1.5 rounded-lg transition-colors"><Plus size={18} /></button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {getPropertiesForSelected().map(prop => (
                    <div key={prop.id} className="bg-background/50 border border-border-color rounded-xl p-4 flex flex-col gap-2 relative group hover:border-text-muted transition-all">
                      <div className="flex justify-between items-start">
                        <div><h5 className="font-bold text-text-main">{prop.projectName}</h5><span className="text-xs text-text-muted font-mono">Lote {prop.lotNumber}</span></div>
                        <span className="px-2 py-0.5 rounded text-[10px] border bg-card-bg text-text-muted border-border-color">{prop.status}</span>
                      </div>
                      <button onClick={() => handleRemoveInterest(prop.id)} className="absolute top-2 right-2 p-1.5 bg-card-bg text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {getPropertiesForSelected().length === 0 && <p className="col-span-full text-text-muted text-sm italic">No hay propiedades asociadas.</p>}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border-color flex justify-end bg-background/50 shrink-0 rounded-b-none md:rounded-b-2xl">
              <button onClick={() => setShowDetailModal(false)} className="px-6 py-2 bg-input-bg hover:bg-background border border-border-color text-text-main rounded-lg">Cerrar</button>
            </div>
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

export default Contacts;
