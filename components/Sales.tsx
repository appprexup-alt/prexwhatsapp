
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Sale, Transaction, OtherIncome, Property, User as CRMUser, FinancialClient } from '../types';
import { format } from 'date-fns';
import {
    Plus,
    TrendingUp,
    TrendingDown,
    Wallet,
    PieChart,
    Building,
    User,
    ArrowUpRight,
    ArrowDownRight,
    X,
    Search,
    Filter,
    ChevronDown,
    Trash2,
    AlertTriangle,
    Calendar,
    Users,
    Briefcase,
    Baby,
    FileText,
    Edit2,
    Check,
    CheckCircle,
    Sparkles
} from 'lucide-react';

const Sales: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'clients' | 'sales' | 'finance'>('clients');
    const [exchangeRate, setExchangeRate] = useState(3.85);
    const [showFinancialModal, setShowFinancialModal] = useState(false);
    const [financialType, setFinancialType] = useState<'income' | 'expense'>('income');
    const [incomeSubtype, setIncomeSubtype] = useState<'sale' | 'other'>('sale');

    // Date Filtering State
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const [sales, setSales] = useState<Sale[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [otherIncomes, setOtherIncomes] = useState<OtherIncome[]>([]);
    const [financialClients, setFinancialClients] = useState<FinancialClient[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [agents, setAgents] = useState<CRMUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterText, setFilterText] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [showMobileSearch, setShowMobileSearch] = useState(false);

    // Client Details State
    const [selectedClient, setSelectedClient] = useState<FinancialClient | null>(null);
    const [showClientDetail, setShowClientDetail] = useState(false);
    const [isEditingClient, setIsEditingClient] = useState(false);

    // New Client State
    const [registerNewClient, setRegisterNewClient] = useState(false);
    const [newClient, setNewClient] = useState<Partial<FinancialClient>>({ civilStatus: 'Soltero' });

    const [newSale, setNewSale] = useState<Partial<Sale>>({ currency: 'USD', status: 'completed' });
    const [newTx, setNewTx] = useState<Partial<Transaction>>({ type: 'expense', currency: 'PEN' });
    const [newOtherIncome, setNewOtherIncome] = useState<Partial<OtherIncome>>({ currency: 'USD' });

    // Client Search State
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [showClientDropdown, setShowClientDropdown] = useState(false);

    // Deletion State
    const [idToDelete, setIdToDelete] = useState<string | null>(null);
    const [typeToDelete, setTypeToDelete] = useState<'sale' | 'transaction' | 'other' | 'client' | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Editing State
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [sData, tData, oData, pData, aData, cData] = await Promise.all([
                db.getSales(),
                db.getTransactions(),
                db.getOtherIncomes(),
                db.getProperties(),
                db.getUsers(),
                db.getFinancialClients()
            ]);
            setSales(sData);
            setTransactions(tData);
            setOtherIncomes(oData);
            setProperties(pData);
            setAgents(aData);
            setFinancialClients(cData);
        } catch (error) {
            console.error('Error loading sales data:', error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadData();
    }, []);

    // Filtered Content by current month/year selection
    const filterByDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    };

    // Calculations
    const monthlyIncomes = [
        ...sales.filter(s => filterByDate(s.date)).map(s => ({ amount: s.amount, currency: s.currency })),
        ...otherIncomes.filter(i => filterByDate(i.date)).map(i => ({ amount: i.amount, currency: i.currency })),
        ...transactions.filter(t => t.type === 'income' && filterByDate(t.date)).map(t => ({ amount: t.amount, currency: t.currency }))
    ];

    const monthlyExpenses = transactions.filter(t => t.type === 'expense' && filterByDate(t.date)).map(t => ({ amount: t.amount, currency: t.currency }));

    const totalIncomePEN = monthlyIncomes.reduce((acc, i) => acc + (i.currency === 'PEN' ? i.amount : i.amount * exchangeRate), 0);
    const totalExpensePEN = monthlyExpenses.reduce((acc, e) => acc + (e.currency === 'PEN' ? e.amount : e.amount * exchangeRate), 0);
    const totalIncomeUSD = monthlyIncomes.filter(i => i.currency === 'USD').reduce((acc, i) => acc + i.amount, 0);
    const totalIncomePEN_ONLY = monthlyIncomes.filter(i => i.currency === 'PEN').reduce((acc, i) => acc + i.amount, 0);

    const balancePEN = totalIncomePEN - totalExpensePEN;

    const handleAddSale = async () => {
        if (!newSale.propertyId || !newSale.amount || !newSale.financialClientId) return;

        let res;
        if (isEditing && editingId) {
            res = await db.updateSale({ ...newSale, id: editingId });
        } else {
            res = await db.addSale({ ...newSale });
        }

        if (res.success) {
            setShowFinancialModal(false);
            setIsEditing(false);
            setEditingId(null);
            setNewSale({ currency: 'USD', status: 'completed' });
            setClientSearchTerm('');
            loadData();
        }
    };

    const handleAddFinancialClient = async () => {
        if (!newClient.name || !newClient.document) return;
        setLoading(true);
        try {
            const res = await db.addFinancialClient(newClient);
            if (res.success) {
                setShowFinancialModal(false);
                setRegisterNewClient(false);
                setNewClient({ civilStatus: 'Soltero' });
                loadData();
            } else {
                alert(res.message);
            }
        } catch (error) {
            console.error('Error adding client:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTransaction = async () => {
        if (!newTx.description || !newTx.amount) return;

        let res;
        if (isEditing && editingId) {
            res = await db.updateTransaction({ ...newTx, id: editingId });
        } else {
            res = await db.addTransaction(newTx);
        }

        if (res.success) {
            setShowFinancialModal(false);
            setIsEditing(false);
            setEditingId(null);
            setNewTx({ type: 'expense', currency: 'PEN' });
            loadData();
        }
    };

    const handleAddOtherIncome = async () => {
        if (!newOtherIncome.description || !newOtherIncome.amount) return;

        let res;
        if (isEditing && editingId) {
            res = await db.updateOtherIncome({ ...newOtherIncome, id: editingId });
        } else {
            res = await db.addOtherIncome(newOtherIncome);
        }

        if (res.success) {
            setShowFinancialModal(false);
            setIsEditing(false);
            setEditingId(null);
            setNewOtherIncome({ currency: 'USD' });
            loadData();
        }
    };

    const confirmDelete = async () => {
        if (!idToDelete || !typeToDelete) return;

        let res;
        if (typeToDelete === 'sale') res = await db.deleteSale(idToDelete);
        else if (typeToDelete === 'transaction') res = await db.deleteTransaction(idToDelete);
        else if (typeToDelete === 'other') res = await db.deleteOtherIncome(idToDelete);
        else if (typeToDelete === 'client') res = await db.deleteFinancialClient(idToDelete);

        if (res?.success) {
            setShowDeleteConfirm(false);
            setIdToDelete(null);
            setTypeToDelete(null);
            loadData();
        }
    };

    const openDeleteModal = (id: string, type: 'sale' | 'transaction' | 'other' | 'client') => {
        setIdToDelete(id);
        setTypeToDelete(type);
        setShowDeleteConfirm(true);
    };

    const handleSaveClient = async () => {
        if (!selectedClient) return;
        setLoading(true);
        try {
            const res = await db.updateFinancialClient(selectedClient);
            if (res.success) {
                await loadData();
                setShowClientDetail(false);
                setIsEditingClient(false);
            } else {
                alert(res.message);
            }
        } catch (error) {
            console.error('Error saving client:', error);
        } finally {
            setLoading(false);
        }
    };

    const openEditModal = (item: any, type: 'sale' | 'transaction' | 'other') => {
        setIsEditing(true);
        setEditingId(item.id);
        setShowFinancialModal(true);

        if (type === 'sale') {
            setFinancialType('income');
            setIncomeSubtype('sale');
            setNewSale({
                propertyId: item.propertyId,
                amount: item.amount,
                currency: item.currency,
                financialClientId: item.financialClientId,
                clientName: item.clientName,
                agentId: item.agentId,
                status: item.status,
                date: item.date,
                notes: item.notes
            });
            setClientSearchTerm(item.clientName || '');
        } else if (type === 'transaction') {
            setFinancialType(item.type);
            setNewTx({
                description: item.description,
                type: item.type,
                amount: item.amount,
                currency: item.currency,
                category: item.category,
                date: item.date,
                notes: item.notes
            });
        } else if (type === 'other') {
            setFinancialType('income');
            setIncomeSubtype('other');
            setNewOtherIncome({
                description: item.description,
                amount: item.amount,
                currency: item.currency,
                category: item.category,
                date: item.date,
                propertyId: item.propertyId
            });
        }
    };

    // Filtering Logic (Search + Date)
    const filteredSales = sales.filter(s => {
        if (!filterByDate(s.date)) return false;
        const prop = properties.find(p => p.id === s.propertyId);
        const propTitle = prop ? `${prop.projectName}${prop.lotNumber ? ` - Lote ${prop.lotNumber}` : ''}` : '';
        const searchStr = `${s.clientName} ${propTitle}`.toLowerCase();
        return searchStr.includes(filterText.toLowerCase());
    });

    const filteredTransactions = transactions.filter(t => {
        if (!filterByDate(t.date)) return false;
        const searchStr = `${t.description} ${t.category}`.toLowerCase();
        return searchStr.includes(filterText.toLowerCase());
    });

    const filteredOtherIncomes = otherIncomes.filter(i => {
        if (!filterByDate(i.date)) return false;
        const searchStr = `${i.description} ${i.category}`.toLowerCase();
        return searchStr.includes(filterText.toLowerCase());
    });

    const filteredFinancialClients = financialClients.filter(c => {
        const prop = properties.find(p => p.id === c.propertyId);
        const propTitle = prop ? `${prop.projectName}${prop.lotNumber ? ` - Lote ${prop.lotNumber}` : ''}` : '';
        const searchStr = `${c.name} ${c.document} ${propTitle}`.toLowerCase();
        return searchStr.includes(filterText.toLowerCase());
    });

    const ledgerMovements = [
        ...filteredSales.map(s => {
            const prop = properties.find(p => p.id === s.propertyId);
            return {
                id: s.id,
                date: s.date,
                description: prop ? `${prop.projectName}${prop.lotNumber ? ` - Lote ${prop.lotNumber}` : ''}` : 'Venta de propiedad',
                category: 'Venta',
                amount: s.amount,
                currency: s.currency,
                type: 'income' as const,
                subType: 'sale' as const,
                clientName: s.clientName
            }
        }),
        ...filteredOtherIncomes.map(i => ({
            id: i.id,
            date: i.date,
            description: i.description || i.category,
            category: i.category,
            amount: i.amount,
            currency: i.currency,
            type: 'income' as const,
            subType: 'other' as const
        })),
        ...filteredTransactions.map(t => ({
            id: t.id,
            date: t.date,
            description: t.description,
            category: t.category,
            amount: t.amount,
            currency: t.currency,
            type: t.type,
            subType: 'tx' as const
        }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="space-y-3 animate-in fade-in duration-500">
            {/* Header & Stats Cards */}
            {/* Header, Stats Cards & Action Bar */}
            <div className="flex flex-col gap-1.5 md:gap-2.5">
                {/* Action Bar (Month, Year, T.C., Search & Main Actions) */}
                <div className="bg-white dark:bg-[#0f1115] p-2 md:p-2 rounded-2xl border border-border-color dark:border-border-color flex flex-row items-center gap-1.5 md:gap-2.5 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />

                    {/* Date Selection (Desktop) */}
                    <div className="hidden lg:flex bg-input-bg dark:bg-[#16191f] border border-border-color dark:border-border-color p-0.5 rounded-xl items-center gap-0.5 shadow-inner">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="bg-transparent text-[10px] font-bold text-text-main outline-none px-2 py-1.5 cursor-pointer hover:bg-white/[0.02] rounded-lg transition-colors"
                        >
                            {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                            ))}
                        </select>
                        <div className="w-px h-3 bg-border-color/50 dark:bg-white/10" />
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="bg-transparent text-[10px] font-bold text-text-main outline-none px-2 py-1.5 cursor-pointer hover:bg-white/[0.02] rounded-lg transition-colors"
                        >
                            {[2024, 2025, 2026].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* T.C. (Desktop) */}
                    <div className="hidden xl:flex bg-input-bg dark:bg-[#16191f] border border-border-color dark:border-border-color px-2.5 py-1.5 rounded-xl items-center gap-1.5 shadow-inner group">
                        <span className="text-[9px] font-bold text-text-muted uppercase tracking-tighter opacity-40 group-hover:opacity-100 transition-opacity">T.C. S/</span>
                        <input
                            type="number"
                            value={exchangeRate}
                            onChange={(e) => setExchangeRate(Number(e.target.value))}
                            className="w-10 bg-transparent text-[11px] font-black text-primary outline-none text-center"
                        />
                    </div>

                    {/* Search & Actions Area */}
                    <div className={`flex-1 flex items-center gap-1.5 transition-all duration-300 ${showMobileSearch ? 'w-full' : 'w-auto'}`}>
                        {/* Date select in mobile when NOT searching */}
                        {!showMobileSearch && (
                            <div className="flex lg:hidden bg-input-bg dark:bg-[#16191f] border border-border-color dark:border-border-color p-0.5 rounded-xl items-center gap-0.5 shadow-inner">
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                    className="bg-transparent text-[10px] font-bold text-text-main outline-none px-1.5 py-1.5"
                                >
                                    {['En', 'Fb', 'Mz', 'Ab', 'My', 'Jn', 'Jl', 'Ag', 'Sp', 'Oc', 'Nv', 'Dc'].map((m, i) => (
                                        <option key={i} value={i}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                                    className="bg-transparent text-[10px] font-bold text-text-main outline-none px-1.5 py-1.5"
                                >
                                    {[24, 25, 26].map(y => (
                                        <option key={2000 + y} value={2000 + y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Desktop Search / Mobile Expandable Search */}
                        <div className={`relative group flex-1 ${!showMobileSearch ? 'hidden md:block' : 'block'}`}>
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted opacity-40 group-focus-within:text-primary group-focus-within:opacity-100 transition-all" size={12} />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="w-full bg-input-bg dark:bg-[#16191f] border border-border-color dark:border-border-color text-text-main text-[11px] font-medium rounded-xl pl-9 pr-4 py-2 placeholder:text-text-muted/30 focus:border-primary/30 outline-none transition-all"
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                            />
                            {showMobileSearch && (
                                <button
                                    onClick={() => setShowMobileSearch(false)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 md:hidden text-text-muted hover:text-text-main"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Mobile Search Trigger Icon */}
                        {!showMobileSearch && (
                            <button
                                onClick={() => setShowMobileSearch(true)}
                                className="md:hidden w-10 h-10 flex items-center justify-center bg-input-bg dark:bg-[#16191f] text-text-muted border border-border-color dark:border-border-color rounded-xl active:scale-95 transition-all"
                            >
                                <Search size={16} />
                            </button>
                        )}

                        {/* Actions (Filter & Add) */}
                        {!showMobileSearch && (
                            <div className="flex gap-1.5 shrink-0">
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`flex items-center justify-center w-10 h-10 md:w-auto md:px-5 md:py-2 text-[11px] font-bold rounded-xl transition-all border ${showFilters
                                        ? 'bg-primary/10 border-primary/20 text-primary'
                                        : 'bg-input-bg dark:bg-[#16191f] text-text-muted hover:text-text-main border-border-color dark:border-border-color'
                                        }`}
                                >
                                    <Filter size={14} />
                                    <span className="hidden md:inline ml-2">Filtros</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setShowFinancialModal(true);
                                        if (activeTab === 'clients') {
                                            setFinancialType('income');
                                            setIncomeSubtype('sale');
                                            setRegisterNewClient(true);
                                        } else if (activeTab === 'sales') {
                                            setFinancialType('income');
                                            setIncomeSubtype('sale');
                                        } else if (activeTab === 'finance') {
                                            setFinancialType('expense');
                                        }
                                    }}
                                    className="bg-primary hover:bg-primary-hover text-white w-10 h-10 md:w-auto md:px-6 md:py-2.5 rounded-xl flex items-center justify-center md:gap-2 transition-all shadow-lg shadow-primary/10 active:scale-95 shrink-0"
                                >
                                    <Plus size={18} />
                                    <span className="hidden md:inline font-bold text-[11px]">
                                        {activeTab === 'clients' ? 'Registrar' : activeTab === 'sales' ? 'Venta' : 'Egreso'}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2.5">
                    <div className="bg-card-bg border border-border-color dark:border-border-color p-2 md:p-2.5 rounded-2xl shadow-sm flex flex-col gap-0.5 md:gap-1.5 transition-all hover:border-green-500/30 group overflow-hidden relative">
                        <div className="flex items-center justify-between">
                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 group-hover:scale-110 transition-transform">
                                <TrendingUp size={14} className="md:size-[16]" />
                            </div>
                            <span className="text-[9px] md:text-[10px] font-bold text-green-500 bg-green-500/5 px-2 py-0.5 rounded-full">Mes</span>
                        </div>
                        <div>
                            <p className="text-[9px] md:text-[10px] text-text-muted font-bold tracking-tight leading-none mb-1 opacity-60">Ingresos PEN</p>
                            <p className="text-base md:text-lg font-bold text-text-main leading-none font-mono">S/ {totalIncomePEN_ONLY.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-card-bg border border-border-color dark:border-border-color p-2 md:p-2.5 rounded-2xl shadow-sm flex flex-col gap-0.5 md:gap-1.5 transition-all hover:border-primary/30 group overflow-hidden relative">
                        <div className="flex items-center justify-between">
                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <Wallet size={14} className="md:size-[16]" />
                            </div>
                            <span className="text-[9px] md:text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full">Mes</span>
                        </div>
                        <div>
                            <p className="text-[9px] md:text-[10px] text-text-muted font-bold tracking-tight leading-none mb-1 opacity-60">Ingresos USD</p>
                            <p className="text-base md:text-lg font-bold text-text-main leading-none font-mono tracking-tighter">${totalIncomeUSD.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-card-bg border border-border-color dark:border-border-color p-2 md:p-2.5 rounded-2xl shadow-sm flex flex-col gap-0.5 md:gap-1.5 transition-all hover:border-red-500/30 group overflow-hidden relative">
                        <div className="flex items-center justify-between">
                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                                <TrendingDown size={14} className="md:size-[16]" />
                            </div>
                            <span className="text-[9px] md:text-[10px] font-bold text-red-500 bg-red-500/5 px-2 py-0.5 rounded-full">Mes</span>
                        </div>
                        <div>
                            <p className="text-[9px] md:text-[10px] text-text-muted font-bold tracking-tight leading-none mb-1 opacity-60">Gastos PEN</p>
                            <p className="text-base md:text-lg font-bold text-text-main leading-none font-mono tracking-tighter">S/ {totalExpensePEN.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className={`border border-border-color dark:border-border-color p-2 md:p-2.5 rounded-2xl shadow-lg flex flex-col gap-0.5 md:gap-1.5 group overflow-hidden relative transition-all ${balancePEN >= 0 ? 'bg-primary/5 shadow-primary/5 hover:border-primary/30' : 'bg-red-500/5 shadow-red-500/5 hover:border-red-500/30'}`}>
                        <div className="absolute top-0 right-0 p-2 opacity-10">
                            <PieChart size={30} className={`md:size-[40] ${balancePEN >= 0 ? 'text-primary' : 'text-red-500'}`} />
                        </div>
                        <div className="flex items-center justify-between relative z-10">
                            <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform ${balancePEN >= 0 ? 'bg-primary shadow-primary/30' : 'bg-red-500 shadow-red-500/30'}`}>
                                <PieChart size={14} className="md:size-[16]" />
                            </div>
                        </div>
                        <div className="relative z-10">
                            <p className={`text-[9px] md:text-[10px] font-bold tracking-tight leading-none mb-1 ${balancePEN >= 0 ? 'text-primary/60' : 'text-red-500/60'}`}>Balance (S/)</p>
                            <p className={`text-base md:text-lg font-bold leading-none font-mono tracking-tighter ${balancePEN >= 0 ? 'text-primary' : 'text-red-500'}`}>S/ {balancePEN.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs & Content */}
            <div className="bg-surface border border-border-color dark:border-border-color rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[500px]">
                <div className="flex border-b border-border-color dark:border-border-color bg-input-bg dark:bg-background/20 px-2 md:px-4 pt-2.5 gap-0.5 md:gap-1.5 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setActiveTab('clients')}
                        className={`px-4 md:px-6 py-2.5 text-[11px] font-bold transition-all rounded-t-2xl relative flex-shrink-0 ${activeTab === 'clients' ? 'text-primary bg-surface border-x border-t border-border-color dark:border-border-color -mb-px shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.1)]' : 'text-text-muted hover:text-text-main hover:bg-primary/5'}`}
                    >
                        {activeTab === 'clients' && <div className="absolute top-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
                        Clientes
                    </button>
                    <button
                        onClick={() => setActiveTab('sales')}
                        className={`px-6 py-2.5 text-[11px] font-bold transition-all rounded-t-2xl relative ${activeTab === 'sales' ? 'text-primary bg-surface border-x border-t border-border-color dark:border-border-color -mb-px shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.1)]' : 'text-text-muted hover:text-text-main hover:bg-primary/5'}`}
                    >
                        {activeTab === 'sales' && <div className="absolute top-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
                        Registro de ventas
                    </button>
                    <button
                        onClick={() => setActiveTab('finance')}
                        className={`px-6 py-2.5 text-[11px] font-bold transition-all rounded-t-2xl relative ${activeTab === 'finance' ? 'text-primary bg-surface border-x border-t border-border-color dark:border-border-color -mb-px shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.1)]' : 'text-text-muted hover:text-text-main hover:bg-primary/5'}`}
                    >
                        {activeTab === 'finance' && <div className="absolute top-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
                        Finanzas y caja
                    </button>
                </div>

                <div className="p-3 md:p-4 flex-1">
                    {loading ? (
                        <div className="h-40 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                    ) : activeTab === 'clients' ? (
                        <div className="space-y-4">
                            <div className="bg-surface/50 border border-border-color rounded-2xl md:p-5 p-4 shadow-xl shadow-black/5 transition-all group overflow-hidden relative">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />

                                <div className="flex justify-between items-start mb-5">
                                    <div className="flex items-center md:gap-4 gap-3">
                                        <div className="md:w-12 md:h-12 w-10 h-10 md:rounded-2xl rounded-xl flex items-center justify-center bg-primary/10 text-primary border border-primary/10 shrink-0 shadow-inner">
                                            <Users className="md:size-6 size-5" />
                                        </div>
                                        <div>
                                            <h3 className="md:text-lg text-base font-bold text-text-main tracking-tight">Cartera de Clientes</h3>
                                            <div className="flex items-center gap-2">
                                                <Sparkles size={12} className="text-primary/60" />
                                                <span className="md:text-[11px] text-[10px] text-text-muted font-bold opacity-60 uppercase tracking-wider">Gestión de propietarios y prospectos</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-border-color dark:border-border-color shadow-sm bg-background/20 backdrop-blur-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-input-bg/80 dark:bg-background/80 border-b border-border-color dark:border-border-color">
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Detalles del Cliente</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Documento</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Propiedad</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-color/30 dark:divide-white/[0.02]">
                                            {filteredFinancialClients.length === 0 ? (
                                                <tr><td colSpan={4} className="p-12 text-center text-text-muted text-[11px] font-medium italic opacity-60">No se encontraron clientes registrados</td></tr>
                                            ) : filteredFinancialClients.map(client => (
                                                <tr key={client.id} className="hover:bg-primary/[0.02] transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center text-primary border border-border-color dark:border-border-color shadow-sm group-hover:scale-105 transition-transform duration-300">
                                                                <User size={18} />
                                                            </div>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[12px] font-bold text-text-main line-clamp-1">{client.name}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] text-text-muted font-bold opacity-80">{client.phone}</span>
                                                                    {client.email && (
                                                                        <>
                                                                            <span className="text-[9px] text-text-muted/40 font-bold tracking-tighter">•</span>
                                                                            <span className="text-[10px] text-text-muted font-bold opacity-60">{client.email}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2.5 py-1 bg-input-bg dark:bg-surface border border-border-color dark:border-border-color rounded-lg text-[10px] font-bold text-text-muted shadow-sm">
                                                            {client.document}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-bold text-text-main line-clamp-1">
                                                                {(() => {
                                                                    const p = properties.find(p => p.id === client.propertyId);
                                                                    return p ? `${p.projectName}${p.lotNumber ? ` - Lote ${p.lotNumber}` : ''}` : 'No vinculada';
                                                                })()}
                                                            </span>
                                                            <span className="text-[9px] text-text-muted font-bold opacity-40 uppercase tracking-widest leading-none mt-1">
                                                                {client.createdAt ? format(new Date(client.createdAt), 'dd MMM, yyyy') : ''}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedClient(client);
                                                                    setShowClientDetail(true);
                                                                    setIsEditingClient(false);
                                                                }}
                                                                className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                                                title="Ver detalles"
                                                            >
                                                                <FileText size={15} />
                                                            </button>
                                                            <button
                                                                onClick={() => openDeleteModal(client.id, 'client')}
                                                                className="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                                                title="Eliminar cliente"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'sales' ? (
                        <div className="space-y-4">
                            <div className="bg-surface/50 border border-border-color rounded-2xl md:p-5 p-4 shadow-xl shadow-black/5 transition-all group overflow-hidden relative">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />

                                <div className="flex justify-between items-start mb-5">
                                    <div className="flex items-center md:gap-4 gap-3">
                                        <div className="md:w-12 md:h-12 w-10 h-10 md:rounded-2xl rounded-xl flex items-center justify-center bg-primary/10 text-primary border border-primary/10 shrink-0 shadow-inner">
                                            <Briefcase className="md:size-6 size-5" />
                                        </div>
                                        <div>
                                            <h3 className="md:text-lg text-base font-bold text-text-main tracking-tight">Registro de Ventas</h3>
                                            <div className="flex items-center gap-2">
                                                <Sparkles size={12} className="text-primary/60" />
                                                <span className="md:text-[11px] text-[10px] text-text-muted font-bold opacity-60 uppercase tracking-wider">Historial de cierres de propiedades</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-border-color dark:border-border-color shadow-sm bg-background/20 backdrop-blur-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-input-bg/80 dark:bg-background/80 border-b border-border-color dark:border-border-color">
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Detalles de Venta</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Comisión</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-center">Estado</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-color/30 dark:divide-white/[0.02]">
                                            {filteredSales.length === 0 ? (
                                                <tr><td colSpan={4} className="p-12 text-center text-text-muted text-[11px] font-medium italic opacity-60">No se encontraron ventas para este período</td></tr>
                                            ) : filteredSales.map(sale => (
                                                <tr key={sale.id} className="hover:bg-primary/[0.02] transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center text-primary border border-border-color dark:border-border-color shadow-sm group-hover:scale-105 transition-transform duration-300">
                                                                <Building size={18} />
                                                            </div>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[12px] font-bold text-text-main line-clamp-1">
                                                                    {(() => {
                                                                        const p = properties.find(p => p.id === sale.propertyId);
                                                                        return p ? `${p.projectName}${p.lotNumber ? ` - Lote ${p.lotNumber}` : ''}` : 'Propiedad desconocida';
                                                                    })()}
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] text-text-muted font-bold flex items-center gap-1 opacity-80">
                                                                        <User size={10} className="text-primary/60" /> {sale.clientName}
                                                                    </span>
                                                                    <span className="text-[9px] text-text-muted/40 font-bold tracking-tighter">•</span>
                                                                    <span className="text-[10px] text-primary/60 font-bold">{format(new Date(sale.date), 'dd MMM, yyyy')}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex flex-col">
                                                            <span className="text-[13px] font-black font-mono text-text-main tracking-tighter">
                                                                {sale.currency === 'USD' ? '$' : 'S/'} {sale.amount.toLocaleString()}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-text-muted opacity-40 uppercase tracking-widest">{sale.currency}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm border ${sale.status === 'completed'
                                                            ? 'bg-green-500/10 text-green-500 border-green-500/10'
                                                            : 'bg-amber-500/10 text-amber-500 border-amber-500/10'}`}>
                                                            {sale.status === 'completed' ? 'Cerrada' : 'Pendiente'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => openEditModal(sale, 'sale')}
                                                                className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                                                title="Editar venta"
                                                            >
                                                                <Edit2 size={15} />
                                                            </button>
                                                            <button
                                                                onClick={() => openDeleteModal(sale.id, 'sale')}
                                                                className="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                                                title="Eliminar venta"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'finance' ? (
                        <div className="space-y-4">
                            <div className="bg-surface/50 border border-border-color rounded-2xl md:p-5 p-4 shadow-xl shadow-black/5 transition-all group overflow-hidden relative">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />

                                <div className="flex justify-between items-start mb-5">
                                    <div className="flex items-center md:gap-4 gap-3">
                                        <div className="md:w-12 md:h-12 w-10 h-10 md:rounded-2xl rounded-xl flex items-center justify-center bg-primary/10 text-primary border border-primary/10 shrink-0 shadow-inner">
                                            <Wallet className="md:size-6 size-5" />
                                        </div>
                                        <div>
                                            <h3 className="md:text-lg text-base font-bold text-text-main tracking-tight">Finanzas y Caja</h3>
                                            <div className="flex items-center gap-2">
                                                <Sparkles size={12} className="text-primary/60" />
                                                <span className="md:text-[11px] text-[10px] text-text-muted font-bold opacity-60 uppercase tracking-wider">Control detallado de ingresos y egresos</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-border-color dark:border-border-color shadow-sm bg-background/20 backdrop-blur-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-input-bg/80 dark:bg-background/80 border-b border-border-color dark:border-border-color">
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Concepto y Movimiento</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Categoría</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Monto</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Monto (S/)</th>
                                                <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-color dark:divide-white/[0.02]">
                                            {ledgerMovements.length === 0 ? (
                                                <tr><td colSpan={5} className="p-12 text-center text-text-muted text-[11px] font-medium italic opacity-60">No se encontraron movimientos registrados</td></tr>
                                            ) : ledgerMovements.map(m => (
                                                <tr key={m.id} className="hover:bg-background/40 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center border border-border-color dark:border-border-color shadow-sm group-hover:scale-105 transition-transform duration-300 ${m.type === 'income'
                                                                ? 'bg-green-500/10 text-green-500'
                                                                : 'bg-red-500/10 text-red-500'
                                                                }`}>
                                                                {m.type === 'income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                                            </div>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[12px] font-bold text-text-main line-clamp-1">{m.description}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] text-text-muted font-bold opacity-80">{format(new Date(m.date), 'dd MMM, yyyy')}</span>
                                                                    <span className="text-[9px] text-text-muted/40 font-bold tracking-tighter">•</span>
                                                                    <span className={`text-[9px] font-black uppercase tracking-wider ${m.type === 'income' ? 'text-green-500/70' : 'text-red-500/70'}`}>
                                                                        {m.type === 'income' ? 'Ingreso' : 'Egreso'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2.5 py-1 bg-input-bg dark:bg-surface border border-border-color dark:border-border-color rounded-lg text-[10px] font-bold text-text-muted shadow-sm">
                                                            {m.category}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex flex-col">
                                                            <span className={`text-[13px] font-black font-mono tracking-tighter ${m.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                                                                {m.type === 'income' ? '+' : '-'} {m.currency === 'USD' ? '$' : 'S/'} {m.amount.toLocaleString()}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-text-muted opacity-40 uppercase tracking-widest">{m.currency}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex flex-col">
                                                            <span className={`text-[13px] font-black font-mono tracking-tighter ${m.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                                                                {m.type === 'income' ? '+' : '-'} S/ {(m.currency === 'PEN' ? m.amount : m.amount * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-text-muted opacity-40 uppercase tracking-widest">Conversión PEN</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => {
                                                                    const originalItem = m.subType === 'sale' ? sales.find(s => s.id === m.id) :
                                                                        m.subType === 'other' ? otherIncomes.find(i => i.id === m.id) :
                                                                            transactions.find(t => t.id === m.id);
                                                                    if (originalItem) openEditModal(originalItem, m.subType === 'sale' ? 'sale' : m.subType === 'other' ? 'other' : 'transaction');
                                                                }}
                                                                className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                                                title="Editar"
                                                            >
                                                                <Edit2 size={15} />
                                                            </button>
                                                            <button
                                                                onClick={() => openDeleteModal(m.id, m.subType === 'sale' ? 'sale' : m.subType === 'other' ? 'other' : 'transaction')}
                                                                className="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                                                title="Eliminar movimiento"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center space-y-2 opacity-40">
                                <Search size={40} className="mx-auto text-text-muted mb-2" />
                                <p className="text-[11px] font-bold text-text-muted">Seleccione una pestaña válida</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Premium Financial Modal */}
            {
                showFinancialModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-surface border border-border-color dark:border-border-color rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            {/* Modal Header */}
                            <div className="p-5 md:p-6 border-b border-border-color dark:border-border-color bg-surface relative overflow-hidden">
                                <div className={`absolute top-0 left-0 w-full h-1.5 ${financialType === 'income' ? 'bg-primary' : 'bg-red-500'}`} />
                                <div className="flex justify-between items-center relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl ${financialType === 'income' ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'}`}>
                                            {financialType === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-text-main">
                                                {activeTab === 'clients' ?
                                                    (isEditing ? 'Editar Perfil del Cliente' : 'Registrar Nuevo Cliente') :
                                                    (isEditing ? 'Editar Registro' : (
                                                        financialType === 'income' ?
                                                            (incomeSubtype === 'sale' ? 'Registrar Venta' : 'Registrar Otro Ingreso') :
                                                            'Registrar Egreso'
                                                    ))
                                                }
                                            </h3>
                                            <p className="text-[10px] text-text-muted font-medium">
                                                {activeTab === 'clients' ? 'Ingresa los datos del cliente para el seguimiento post-venta' : 'Completa los datos para el registro financiero'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowFinancialModal(false);
                                            setIsEditing(false);
                                            setEditingId(null);
                                        }}
                                        className="p-2 hover:bg-background rounded-xl transition-colors text-text-muted"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 md:p-6 space-y-4 md:space-y-5 overflow-y-auto max-h-[70vh] custom-scrollbar">
                                {/* Form Fields */}
                                <div className="space-y-4">
                                    {activeTab === 'clients' ? (
                                        <div className="bg-surface border border-border-color rounded-2xl p-4 shadow-sm space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                            {/* GRUPO 1: IDENTIDAD */}
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                                                        <CheckCircle size={12} />
                                                    </div>
                                                    <span className="text-[11px] font-bold text-text-main tracking-wider">Identidad y registro</span>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-text-muted/60 pl-1">Nombre completo</label>
                                                        <input
                                                            className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-xs font-bold text-text-main outline-none focus:border-primary/30 transition-all shadow-inner tracking-tight placeholder:opacity-30"
                                                            placeholder="Nombre y apellidos"
                                                            value={newClient.name || ''}
                                                            onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-text-muted/60 pl-1">Documento (DNI/RUC)</label>
                                                            <input
                                                                className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-xs font-bold text-text-main outline-none focus:border-primary/30 transition-all shadow-inner font-mono tracking-tighter"
                                                                placeholder="88888888"
                                                                value={newClient.document || ''}
                                                                onChange={e => setNewClient({ ...newClient, document: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-text-muted/60 pl-1">Fecha nacimiento</label>
                                                            <input
                                                                type="date"
                                                                className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-xs font-bold text-text-main outline-none focus:border-primary/30 transition-all shadow-inner"
                                                                value={newClient.birthDate || ''}
                                                                onChange={e => setNewClient({ ...newClient, birthDate: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* GRUPO 2: CONTACTO Y UBICACIÓN */}
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500">
                                                        <Briefcase size={12} />
                                                    </div>
                                                    <span className="text-[11px] font-bold text-text-main tracking-wider">Contacto y ubicación</span>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-text-muted/60 pl-1">Teléfono / WhatsApp</label>
                                                            <input
                                                                className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-xs font-bold text-text-main outline-none focus:border-primary/30 transition-all shadow-inner"
                                                                placeholder="519..."
                                                                value={newClient.phone || ''}
                                                                onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-text-muted/60 pl-1">Profesión</label>
                                                            <input
                                                                className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-xs font-bold text-text-main outline-none focus:border-primary/30 transition-all shadow-inner"
                                                                placeholder="Ocupación"
                                                                value={newClient.occupation || ''}
                                                                onChange={e => setNewClient({ ...newClient, occupation: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-text-muted/60 pl-1">Email estratégico</label>
                                                        <input
                                                            className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-xs font-bold text-text-main outline-none focus:border-primary/30 transition-all shadow-inner"
                                                            placeholder="cliente@ejemplo.com"
                                                            value={newClient.email || ''}
                                                            onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                                                        />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-text-muted/60 pl-1">Dirección de domicilio</label>
                                                        <input
                                                            className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-xs font-bold text-text-main outline-none focus:border-primary/30 transition-all shadow-inner"
                                                            placeholder="Ej: Av. Principal 123..."
                                                            value={newClient.address || ''}
                                                            onChange={e => setNewClient({ ...newClient, address: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* GRUPO 3: PERFIL FAMILIAR */}
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                                                        <Users size={12} />
                                                    </div>
                                                    <span className="text-[11px] font-bold text-text-main tracking-wider">Perfil familiar y estado civil</span>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-text-muted/60 pl-1">Estado civil</label>
                                                            <div className="relative group/select">
                                                                <select
                                                                    className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-xs font-bold text-text-main outline-none appearance-none cursor-pointer transition-all"
                                                                    value={newClient.civilStatus || 'Soltero'}
                                                                    onChange={e => setNewClient({ ...newClient, civilStatus: e.target.value as any })}
                                                                >
                                                                    <option value="Soltero">Soltero/a</option>
                                                                    <option value="Casado">Casado/a</option>
                                                                    <option value="Divorciado">Divorciado/a</option>
                                                                    <option value="Viudo">Viudo/a</option>
                                                                </select>
                                                                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted opacity-40 group-hover/select:opacity-100 transition-all" />
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 bg-input-bg border border-border-color rounded-xl px-4 py-2 shadow-inner">
                                                            <button
                                                                onClick={() => setNewClient({ ...newClient, hasChildren: !newClient.hasChildren })}
                                                                className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${newClient.hasChildren ? 'bg-primary' : 'bg-white/10'}`}
                                                            >
                                                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${newClient.hasChildren ? 'left-5' : 'left-1'}`} />
                                                            </button>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-text-main tracking-tight leading-none mb-0.5">Hijos</span>
                                                                <span className="text-[8px] text-text-muted font-bold opacity-40 uppercase leading-none">Post-venta</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {newClient.civilStatus === 'Casado' && (
                                                        <div className="p-4 bg-primary/5 border border-border-color rounded-2xl space-y-4 animate-in zoom-in-95 duration-200">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center text-primary"><User size={10} /></div>
                                                                <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Datos del cónyuge</span>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div className="space-y-1">
                                                                    <label className="text-[8px] font-bold text-primary/40 uppercase pl-1 tracking-widest">Nombre completo</label>
                                                                    <input
                                                                        className="w-full bg-input-bg border border-border-color focus:border-primary/20 rounded-xl px-4 py-1.5 text-[10px] font-bold text-text-main outline-none transition-all"
                                                                        value={newClient.spouseName || ''}
                                                                        onChange={e => setNewClient({ ...newClient, spouseName: e.target.value })}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="text-[8px] font-bold text-primary/40 uppercase pl-1 tracking-widest">Documento</label>
                                                                    <input
                                                                        className="w-full bg-input-bg border border-border-color focus:border-primary/20 rounded-xl px-4 py-1.5 text-[10px] font-bold text-text-main outline-none transition-all font-mono"
                                                                        value={newClient.spouseDocument || ''}
                                                                        onChange={e => setNewClient({ ...newClient, spouseDocument: e.target.value })}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Type Toggle - Moved inside else block */}
                                            <div className="flex p-0.5 bg-input-bg rounded-xl border border-border-color shadow-inner shrink-0">
                                                <button
                                                    onClick={() => setFinancialType('income')}
                                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${financialType === 'income'
                                                        ? 'bg-surface text-primary shadow-sm'
                                                        : 'text-text-muted hover:text-text-main'
                                                        }`}
                                                >
                                                    <TrendingUp size={13} /> Ingreso
                                                </button>
                                                <button
                                                    onClick={() => setFinancialType('expense')}
                                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${financialType === 'expense'
                                                        ? 'bg-surface text-red-500 shadow-sm'
                                                        : 'text-text-muted hover:text-text-main'
                                                        }`}
                                                >
                                                    <TrendingDown size={13} /> Egreso
                                                </button>
                                            </div>

                                            {financialType === 'income' && (
                                                <div className="flex p-0.5 bg-input-bg rounded-xl border border-border-color shadow-inner shrink-0 w-full sm:w-fit mx-auto">
                                                    <button
                                                        onClick={() => setIncomeSubtype('sale')}
                                                        className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${incomeSubtype === 'sale' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'
                                                            }`}
                                                    >
                                                        <Building size={12} /> Venta
                                                    </button>
                                                    <button
                                                        onClick={() => setIncomeSubtype('other')}
                                                        className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${incomeSubtype === 'other' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'
                                                            }`}
                                                    >
                                                        <Wallet size={12} /> Otros Ingresos
                                                    </button>
                                                </div>
                                            )}

                                            {financialType === 'income' && incomeSubtype === 'sale' ? (
                                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    {/* GRUPO 1: OPERACIÓN */}
                                                    <div className="bg-input-bg dark:bg-surface/50 border border-border-color dark:border-border-color rounded-2xl p-4 space-y-2.5 shadow-sm relative">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                                <Building size={12} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-text-main tracking-wider">Operación</span>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-bold text-text-muted/60 pl-1">Propiedad vendida</label>
                                                                <div className="relative group/select">
                                                                    <select
                                                                        className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-primary/30 dark:focus:border-border-color shadow-inner appearance-none cursor-pointer transition-all pr-8"
                                                                        value={newSale.propertyId || ''}
                                                                        onChange={(e) => {
                                                                            const pId = e.target.value;
                                                                            setNewSale({ ...newSale, propertyId: pId });
                                                                            setNewClient({ ...newClient, propertyId: pId });
                                                                        }}
                                                                    >
                                                                        <option value="">Seleccionar propiedad...</option>
                                                                        {properties.map(p => (
                                                                            <option key={p.id} value={p.id}>
                                                                                {p.projectName} {p.lotNumber ? `- Lote ${p.lotNumber}` : ''}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted opacity-40 group-hover/select:opacity-100 transition-all" />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-bold text-text-muted/60 pl-1">Gestor asignado</label>
                                                                <div className="relative group/select">
                                                                    <select
                                                                        className="w-full bg-input-bg border border-border-color rounded-xl px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-primary shadow-inner appearance-none cursor-pointer transition-all pr-8"
                                                                        value={newSale.agentId || ''}
                                                                        onChange={(e) => setNewSale({ ...newSale, agentId: e.target.value })}
                                                                    >
                                                                        <option value="">Seleccionar gestor...</option>
                                                                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                                    </select>
                                                                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted opacity-40 group-hover/select:opacity-100 transition-all" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* GRUPO 2: DETALLES ECONÓMICOS */}
                                                    <div className="bg-input-bg dark:bg-surface/50 border border-border-color dark:border-border-color rounded-2xl p-4 space-y-2.5 shadow-sm relative">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                                                                <Wallet size={12} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-text-main tracking-wider">Detalles económicos</span>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-text-muted/60 pl-1">Comisión recibida</label>
                                                            <div className="flex gap-2">
                                                                <div className="relative group/select w-24 shrink-0">
                                                                    <select
                                                                        className="w-full bg-input-bg border border-border-color rounded-xl px-2 py-2 text-[11px] font-bold text-primary outline-none focus:border-primary shadow-inner appearance-none cursor-pointer transition-all text-center"
                                                                        value={newSale.currency}
                                                                        onChange={(e) => setNewSale({ ...newSale, currency: e.target.value })}
                                                                    >
                                                                        <option value="USD">USD ($)</option>
                                                                        <option value="PEN">PEN (S/)</option>
                                                                    </select>
                                                                    <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-primary opacity-40" />
                                                                </div>
                                                                <input
                                                                    type="number"
                                                                    className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-2 text-[11px] font-bold text-text-main outline-none focus:border-primary shadow-inner placeholder:text-text-muted/30 transition-all font-mono"
                                                                    placeholder="0.00"
                                                                    value={newSale.amount || ''}
                                                                    onChange={(e) => setNewSale({ ...newSale, amount: Number(e.target.value) })}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* GRUPO 3: CLIENTE */}
                                                    <div className="bg-input-bg dark:bg-surface/50 border border-border-color dark:border-border-color rounded-2xl p-4 space-y-2.5 shadow-sm relative">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                                <User size={12} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-text-main tracking-wider">Cliente (comprador)</span>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-text-muted/60 pl-1">Buscar cliente</label>
                                                            <div className="relative group">
                                                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors">
                                                                    <Search size={14} />
                                                                </div>
                                                                <input
                                                                    className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl pl-9 pr-4 py-2 text-[11px] font-bold text-text-main outline-none focus:border-primary/30 dark:focus:border-border-color shadow-inner placeholder:text-text-muted/20 transition-all"
                                                                    placeholder="Nombre o documento..."
                                                                    value={clientSearchTerm}
                                                                    onChange={(e) => {
                                                                        setClientSearchTerm(e.target.value);
                                                                        setShowClientDropdown(true);
                                                                    }}
                                                                    onFocus={() => setShowClientDropdown(true)}
                                                                />
                                                                {showClientDropdown && (
                                                                    <div className="absolute top-full left-0 w-full mt-1 bg-surface border border-border-color rounded-xl shadow-xl z-[120] overflow-hidden max-h-[180px] overflow-y-auto custom-scrollbar animate-in slide-in-from-top-1 duration-200">
                                                                        {financialClients
                                                                            .filter(c =>
                                                                                c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                                                c.document.includes(clientSearchTerm)
                                                                            )
                                                                            .map(c => (
                                                                                <button
                                                                                    key={c.id}
                                                                                    onClick={() => {
                                                                                        setNewSale({ ...newSale, financialClientId: c.id, clientName: c.name });
                                                                                        setClientSearchTerm(c.name);
                                                                                        setShowClientDropdown(false);
                                                                                    }}
                                                                                    className="w-full px-3 py-2 text-left hover:bg-primary/5 flex items-center justify-between group transition-colors border-b border-border-color/50 last:border-0"
                                                                                >
                                                                                    <div className="flex flex-col">
                                                                                        <span className="text-[10px] font-bold text-text-main group-hover:text-primary transition-colors">{c.name}</span>
                                                                                        <span className="text-[8px] text-text-muted font-bold opacity-60">{c.document}</span>
                                                                                    </div>
                                                                                    <Check size={12} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                                </button>
                                                                            ))
                                                                        }
                                                                        {financialClients.filter(c =>
                                                                            c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                                            c.document.includes(clientSearchTerm)
                                                                        ).length === 0 && (
                                                                                <div className="px-3 py-4 text-center text-[9px] text-text-muted italic">
                                                                                    No encontrado. Regístrelo en "Clientes".
                                                                                </div>
                                                                            )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : financialType === 'income' && incomeSubtype === 'other' ? (
                                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <div className="bg-input-bg dark:bg-surface/50 border border-border-color dark:border-border-color rounded-2xl p-4 space-y-2.5 shadow-sm relative">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                                <FileText size={12} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-text-main tracking-wider">Detalles del ingreso</span>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-text-muted/60 pl-1">Descripción</label>
                                                            <input
                                                                className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-primary/30 dark:focus:border-border-color shadow-inner placeholder:text-text-muted/20 transition-all"
                                                                placeholder="Ej: Bono por metas, Premio..."
                                                                value={newOtherIncome.description || ''}
                                                                onChange={(e) => setNewOtherIncome({ ...newOtherIncome, description: e.target.value })}
                                                            />
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-bold text-text-muted/60 pl-1">Monto</label>
                                                                <div className="flex gap-2">
                                                                    <div className="relative group/select w-20 shrink-0">
                                                                        <select
                                                                            className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-2 py-2 text-[11px] font-bold text-primary outline-none focus:border-primary/30 dark:focus:border-border-color shadow-inner appearance-none cursor-pointer transition-all text-center"
                                                                            value={newOtherIncome.currency}
                                                                            onChange={(e) => setNewOtherIncome({ ...newOtherIncome, currency: e.target.value })}
                                                                        >
                                                                            <option value="USD">$</option>
                                                                            <option value="PEN">S/</option>
                                                                        </select>
                                                                    </div>
                                                                    <input
                                                                        type="number"
                                                                        className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-primary/30 dark:focus:border-border-color shadow-inner placeholder:text-text-muted/20 transition-all font-mono"
                                                                        placeholder="0.00"
                                                                        value={newOtherIncome.amount || ''}
                                                                        onChange={(e) => setNewOtherIncome({ ...newOtherIncome, amount: Number(e.target.value) })}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-bold text-text-muted/60 pl-1">Categoría</label>
                                                                <div className="relative group/select">
                                                                    <select
                                                                        className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-primary/30 dark:focus:border-border-color shadow-inner appearance-none cursor-pointer transition-all pr-8"
                                                                        value={newOtherIncome.category || ''}
                                                                        onChange={(e) => setNewOtherIncome({ ...newOtherIncome, category: e.target.value })}
                                                                    >
                                                                        <option value="">Seleccionar...</option>
                                                                        <option value="Bono">Bono</option>
                                                                        <option value="Premio">Premio</option>
                                                                        <option value="Alquiler">Alquiler</option>
                                                                        <option value="Otros">Otros</option>
                                                                    </select>
                                                                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted opacity-40 group-hover/select:opacity-100 transition-all" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <div className="bg-input-bg dark:bg-surface/50 border border-border-color dark:border-border-color rounded-2xl p-4 space-y-2.5 shadow-sm relative">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                                                                <TrendingDown size={12} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-text-main tracking-wider">Detalles del egreso</span>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-text-muted/60 pl-1">Descripción del egreso</label>
                                                            <input
                                                                className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-red-500/30 dark:focus:border-border-color shadow-inner placeholder:text-text-muted/20 transition-all"
                                                                placeholder="Ej: Pago de publicidad, movilidad..."
                                                                value={newTx.description || ''}
                                                                onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                                                            />
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-bold text-text-muted/60 pl-1">Monto</label>
                                                                <div className="flex gap-2">
                                                                    <div className="relative group/select w-20 shrink-0">
                                                                        <select
                                                                            className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-2 py-2 text-[11px] font-bold text-red-500 outline-none focus:border-red-500/30 shadow-inner appearance-none cursor-pointer transition-all text-center"
                                                                            value={newTx.currency}
                                                                            onChange={(e) => setNewTx({ ...newTx, currency: e.target.value })}
                                                                        >
                                                                            <option value="PEN">S/</option>
                                                                            <option value="USD">$</option>
                                                                        </select>
                                                                    </div>
                                                                    <input
                                                                        type="number"
                                                                        className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-red-500/30 dark:focus:border-border-color shadow-inner placeholder:text-text-muted/20 transition-all font-mono"
                                                                        placeholder="0.00"
                                                                        value={newTx.amount || ''}
                                                                        onChange={(e) => setNewTx({ ...newTx, amount: Number(e.target.value) })}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-bold text-text-muted/60 pl-1">Categoría</label>
                                                                <div className="relative group/select">
                                                                    <select
                                                                        className="w-full bg-surface dark:bg-input-bg border border-border-color dark:border-border-color rounded-xl px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-red-500/30 dark:focus:border-border-color shadow-inner appearance-none cursor-pointer transition-all pr-8"
                                                                        value={newTx.category || ''}
                                                                        onChange={(e) => setNewTx({ ...newTx, category: e.target.value })}
                                                                    >
                                                                        <option value="">Seleccionar...</option>
                                                                        <option value="Marketing">Marketing</option>
                                                                        <option value="Operativo">Operativo</option>
                                                                        <option value="Servicios">Servicios</option>
                                                                        <option value="Otros">Otros</option>
                                                                    </select>
                                                                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted opacity-40 group-hover/select:opacity-100 transition-all" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    )}

                                    <button
                                        onClick={() => {
                                            if (activeTab === 'clients') {
                                                handleAddFinancialClient();
                                            } else if (financialType === 'income') {
                                                if (incomeSubtype === 'sale') handleAddSale();
                                                else handleAddOtherIncome();
                                            } else {
                                                handleAddTransaction();
                                            }
                                        }}
                                        className={`w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] transition-all active:scale-[0.98] shadow-2xl flex items-center justify-center gap-3 ${financialType === 'income' || activeTab === 'clients'
                                            ? 'bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white shadow-lg shadow-primary/10 border-t border-white/10'
                                            : 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-600'
                                            }`}
                                    >
                                        <Plus size={15} />
                                        <span>{activeTab === 'clients' ? (isEditing ? 'Sincronizar Captura' : 'Inyectar Registro') : 'Guardar Registro'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-surface border border-border-color dark:border-border-color rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-8 flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center text-danger mb-6 shadow-inner">
                                    <AlertTriangle size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-text-main tracking-tight mb-2">¿Confirmar eliminación?</h3>
                                <p className="text-text-muted text-xs font-bold leading-relaxed opacity-60">
                                    Esta acción es irreversible y eliminará permanentemente {
                                        typeToDelete === 'sale' ? 'esta venta' :
                                            typeToDelete === 'transaction' ? 'este egreso' :
                                                typeToDelete === 'client' ? 'este cliente' : 'este ingreso'
                                    }.
                                </p>
                            </div>
                            <div className="p-6 border-t border-border-color dark:border-border-color flex justify-center gap-4 bg-surface/50">
                                <button
                                    onClick={() => { setShowDeleteConfirm(false); setIdToDelete(null); setTypeToDelete(null); }}
                                    className="flex-1 px-6 py-3 text-xs font-bold text-text-muted hover:text-text-main transition-all active:scale-95"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-6 py-3 bg-danger hover:bg-red-700 text-white rounded-2xl text-xs font-bold transition-all shadow-xl shadow-danger/20 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    <span>Eliminar</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Client Detail Modal */}
            {
                showClientDetail && selectedClient && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-surface border border-border-color dark:border-border-color rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center p-5 md:p-6 border-b border-border-color dark:border-border-color bg-background/50">
                                <div>
                                    <h3 className="text-base md:text-lg font-bold text-text-main tracking-tight flex items-center gap-2">
                                        <User className="text-primary" size={20} />
                                        {isEditingClient ? 'Editar Perfil del Cliente' : 'Expediente del Cliente'}
                                    </h3>
                                    <p className="text-[10px] text-text-muted font-bold opacity-60">Gestión de datos personales y post-venta</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isEditingClient && (
                                        <button
                                            onClick={() => setIsEditingClient(true)}
                                            className="p-2 md:p-2.5 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all active:scale-95"
                                        >
                                            <Edit2 size={16} md:size={18} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setShowClientDetail(false); setIsEditingClient(false); }}
                                        className="p-2 md:p-2.5 bg-background border border-primary/5 rounded-xl hover:bg-white/[0.02] transition-all text-text-muted active:scale-95"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-5 md:p-6 max-h-[75vh] overflow-y-auto custom-scrollbar space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Datos Generales */}
                                    <div className="bg-input-bg dark:bg-surface/50 border border-border-color dark:border-border-color rounded-2xl p-4 space-y-4 shadow-sm relative overflow-hidden">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                <FileText size={12} />
                                            </div>
                                            <span className="text-[10px] font-bold text-text-main uppercase tracking-wider">Datos Generales</span>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Nombre Completo</label>
                                                <input
                                                    disabled={!isEditingClient}
                                                    className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-primary/30 transition-all disabled:opacity-70"
                                                    value={selectedClient.name}
                                                    onChange={(e) => setSelectedClient({ ...selectedClient, name: e.target.value })}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Documento</label>
                                                    <input
                                                        disabled={!isEditingClient}
                                                        className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70"
                                                        value={selectedClient.document}
                                                        onChange={(e) => setSelectedClient({ ...selectedClient, document: e.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Fec. Nacimiento</label>
                                                    <input
                                                        type="date"
                                                        disabled={!isEditingClient}
                                                        className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70 [color-scheme:dark]"
                                                        value={selectedClient.birthDate || ''}
                                                        onChange={(e) => setSelectedClient({ ...selectedClient, birthDate: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Contacto y Perfil */}
                                    <div className="bg-input-bg dark:bg-surface/50 border border-border-color dark:border-border-color rounded-2xl p-4 space-y-4 shadow-sm relative overflow-hidden">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                <Wallet size={12} />
                                            </div>
                                            <span className="text-[10px] font-bold text-text-main uppercase tracking-wider">Contacto y Perfil</span>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">WhatsApp</label>
                                                    <input
                                                        disabled={!isEditingClient}
                                                        className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70"
                                                        value={selectedClient.phone || ''}
                                                        onChange={(e) => setSelectedClient({ ...selectedClient, phone: e.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Profesión</label>
                                                    <input
                                                        disabled={!isEditingClient}
                                                        className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70"
                                                        placeholder="Ej: Ingeniero..."
                                                        value={selectedClient.occupation || ''}
                                                        onChange={(e) => setSelectedClient({ ...selectedClient, occupation: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Email</label>
                                                <input
                                                    disabled={!isEditingClient}
                                                    className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70"
                                                    placeholder="correo@ejemplo.com"
                                                    value={selectedClient.email || ''}
                                                    onChange={(e) => setSelectedClient({ ...selectedClient, email: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Dirección</label>
                                                <input
                                                    disabled={!isEditingClient}
                                                    className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70"
                                                    placeholder="Av. Principal 123..."
                                                    value={selectedClient.address || ''}
                                                    onChange={(e) => setSelectedClient({ ...selectedClient, address: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Estado Civil y Familia */}
                                <div className="bg-input-bg dark:bg-surface/50 border border-border-color dark:border-border-color rounded-2xl p-4 space-y-4 shadow-sm relative overflow-hidden">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                            <Users size={12} />
                                        </div>
                                        <span className="text-[10px] font-bold text-text-main uppercase tracking-wider">Estado Civil y Familia</span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Estado Civil</label>
                                                <select
                                                    disabled={!isEditingClient}
                                                    className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70 cursor-pointer"
                                                    value={selectedClient.civilStatus}
                                                    onChange={(e) => setSelectedClient({ ...selectedClient, civilStatus: e.target.value as any })}
                                                >
                                                    <option value="Soltero">Soltero/a</option>
                                                    <option value="Casado">Casado/a</option>
                                                    <option value="Divorciado">Divorciado/a</option>
                                                    <option value="Viudo">Viudo/a</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-3 bg-white/[0.02] p-3 rounded-xl border border-primary/5">
                                                <button
                                                    disabled={!isEditingClient}
                                                    onClick={() => setSelectedClient({ ...selectedClient, hasChildren: !selectedClient.hasChildren })}
                                                    className={`w-9 h-5 rounded-full transition-all relative ${selectedClient.hasChildren ? 'bg-primary' : 'bg-white/10'}`}
                                                >
                                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${selectedClient.hasChildren ? 'left-5' : 'left-1'}`} />
                                                </button>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-bold text-text-main leading-tight">¿Tiene hijos?</span>
                                                    <span className="text-[9px] text-text-muted font-bold opacity-40">Campañas familiares</span>
                                                </div>
                                            </div>
                                        </div>

                                        {selectedClient.hasChildren && (
                                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Número de Hijos</label>
                                                    <input
                                                        type="number"
                                                        disabled={!isEditingClient}
                                                        className="w-full bg-white/[0.02] border border-primary/20 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-primary/50 transition-all disabled:opacity-70"
                                                        value={selectedClient.numberOfChildren || 0}
                                                        onChange={(e) => setSelectedClient({ ...selectedClient, numberOfChildren: Number(e.target.value) })}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Detalles (Edades/Nombres)</label>
                                                    <textarea
                                                        disabled={!isEditingClient}
                                                        className="w-full bg-white/[0.02] border border-primary/20 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-primary/50 transition-all disabled:opacity-70 min-h-[60px] resize-none"
                                                        placeholder="Ej: Juan (5), Sofía (8)..."
                                                        value={selectedClient.childrenDetails || ''}
                                                        onChange={(e) => setSelectedClient({ ...selectedClient, childrenDetails: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Información del Cónyuge */}
                                {selectedClient.civilStatus === 'Casado' && (
                                    <div className="bg-surface/50 border border-primary/5 rounded-2xl p-4 space-y-4 shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                <User size={12} />
                                            </div>
                                            <span className="text-[10px] font-bold text-text-main uppercase tracking-wider">Información del Cónyuge</span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Nombre Completo</label>
                                                <input
                                                    disabled={!isEditingClient}
                                                    className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70"
                                                    value={selectedClient.spouseName || ''}
                                                    onChange={(e) => setSelectedClient({ ...selectedClient, spouseName: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">DNI / Documento</label>
                                                <input
                                                    disabled={!isEditingClient}
                                                    className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70"
                                                    value={selectedClient.spouseDocument || ''}
                                                    onChange={(e) => setSelectedClient({ ...selectedClient, spouseDocument: e.target.value })}
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Domicilio Conyugal</label>
                                                <input
                                                    disabled={!isEditingClient}
                                                    className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70"
                                                    value={selectedClient.spouseAddress || ''}
                                                    onChange={(e) => setSelectedClient({ ...selectedClient, spouseAddress: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Notas Adicionales */}
                                <div className="bg-surface/50 border border-primary/5 rounded-2xl p-4 space-y-4 shadow-sm relative overflow-hidden">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                            <Building size={12} />
                                        </div>
                                        <span className="text-[10px] font-bold text-text-main uppercase tracking-wider">Notas y Post-Venta</span>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-text-muted ml-1 uppercase tracking-wider opacity-60">Notas Adicionales</label>
                                        <textarea
                                            disabled={!isEditingClient}
                                            className="w-full bg-white/[0.02] border border-primary/5 rounded-xl px-4 py-3 text-[11px] font-bold outline-none focus:border-white/20 transition-all disabled:opacity-70 min-h-[80px] resize-none"
                                            placeholder="Detalles de interés, preferencias, historial..."
                                            value={selectedClient.notes || ''}
                                            onChange={(e) => setSelectedClient({ ...selectedClient, notes: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {isEditingClient && (
                                <div className="p-4 md:p-5 border-t border-border-color bg-background/50 flex justify-end gap-3">
                                    <button
                                        onClick={() => setIsEditingClient(false)}
                                        className="px-5 py-2.5 text-[11px] font-bold text-text-muted hover:text-text-main transition-all active:scale-95"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSaveClient}
                                        className="px-8 py-2.5 bg-primary text-white rounded-xl text-[11px] font-black transition-all shadow-lg shadow-primary/20 active:scale-95 flex items-center gap-2"
                                    >
                                        <Check size={16} />
                                        <span>Guardar Cambios</span>
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>
                )
            }
        </div>
    );
};

export default Sales;
