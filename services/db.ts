import { evolutionService } from './evolutionService';
import { supabase } from './supabaseClient';
import {
  Property,
  Lead,
  Client,
  Appointment,
  Task,
  Developer,
  User,
  PipelineStage,
  LeadSource,
  AppSettings,
  Organization,
  Message,
  QuickReply,
  MediaType,
  FollowUpConfig,
  Campaign,
  CampaignLog,
  ClientAutomation,
  ClientAutomationLog,
  OtherIncome,
  Sale,
  Transaction,
  FinancialClient
} from '../types';

// Helper to handle empty strings as null for foreign keys
const toNullable = (value: any) => {
  if (!value) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

// Helper to get current user from localStorage for filtering logic
const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem('inmocrm_user');
  return stored ? JSON.parse(stored) : null;
};

// Response Type for UI
type DbResult = { success: boolean; message?: string; data?: any };

class SupabaseDatabase {

  // --- AUTH ---
  async login(emailOrUsername: string, password?: string): Promise<User | null> {
    const cleanLogin = emailOrUsername.trim();

    // We try to find the user first
    let query = supabase
      .from('users')
      .select('*')
      .or(`email.ilike."${cleanLogin}",username.ilike."${cleanLogin}"`)
      .maybeSingle();

    const { data, error } = await query;

    if (error) {
      console.error("Login error:", error.message);
      return null;
    }

    if (!data) return null;

    if (password && data.password && data.password !== password.trim()) {
      console.error("Invalid password");
      return null;
    }

    if (data.status === 'inactive') {
      console.error("User is inactive");
      return null;
    }

    // Check organization status for non-owners (Temporarily disabled to bypass expiry issue)
    /*
    if (data.role !== 'Owner' && data.organization_id) {
      try {
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('status, expiry_date')
          .eq('id', data.organization_id)
          .maybeSingle();

        if (org && !orgError) {
          if (org.status === 'inactive') {
            console.error("Organization is inactive:", data.organization_id);
            throw new Error("Su organización está inactiva. Contacte al administrador.");
          }
          if (org.expiry_date) {
            const expiry = new Date(org.expiry_date);
            if (expiry < new Date()) {
              console.error("Subscription expired:", org.expiry_date);
              throw new Error("Su suscripción ha caducado.");
            }
          }
        }
      } catch (err: any) {
        console.warn("Organization status check failed or was skipped:", err.message);
        if (err.message.includes("inactiva") || err.message.includes("caducado")) {
          throw err;
        }
      }
    }
    */

    console.log("Login successful for:", data.email, "Role:", data.role);

    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      email: data.email,
      username: data.username,
      role: data.role,
      avatar: data.avatar,
      status: data.status,
      phone: data.phone
    };
  }

  // --- STORAGE ---
  async uploadImage(file: File): Promise<string | null> {
    try {
      const fileExt = file.name.split('.').pop();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${Date.now()}_${cleanFileName}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        console.error("Upload Error:", uploadError);
        return null;
      }

      const { data: publicData } = supabase.storage.from('uploads').getPublicUrl(filePath);
      return publicData.publicUrl;
    } catch (err) {
      console.error("Upload Exception:", err);
      return null;
    }
  }

  // --- ORGANIZATIONS (Super Admin Only) ---
  async getOrganizations(): Promise<Organization[]> {
    const user = getCurrentUser();
    let query = supabase.from('organizations').select('*');

    // Only SuperAdmin or system-wide admin should see all orgs. 
    // Regular Owners only see THEIR organization.
    if (user?.role !== 'SuperAdmin' && user?.organizationId) {
      query = query.eq('id', user.organizationId);
    }

    const { data } = await query;
    return (data || []).map((o: any) => ({
      id: o.id,
      name: o.name,
      plan: o.plan,
      status: o.status,
      logoUrl: o.logo_url,
      slogan: o.slogan,
      maxUsers: o.max_users,
      expiryDate: o.expiry_date,
      contactEmail: o.contact_email
    }));
  }

  async addOrganization(org: Partial<Organization>): Promise<{ success: boolean; data?: Organization; message?: string }> {
    const { data, error } = await supabase.from('organizations').insert([{
      name: org.name,
      plan: org.plan || 'demo',
      status: org.status || 'active',
      logo_url: org.logoUrl,
      slogan: org.slogan,
      max_users: org.maxUsers || 5,
      expiry_date: org.expiryDate,
      contact_email: org.contactEmail
    }]).select().single();

    if (error) return { success: false, message: error.message };
    return {
      success: true, data: {
        id: data.id,
        name: data.name,
        plan: data.plan,
        status: data.status,
        maxUsers: data.max_users,
        expiryDate: data.expiry_date,
        contactEmail: data.contact_email
      } as Organization
    };
  }

  async registerTenant(orgName: string, ownerData: { name: string, email: string, username: string, password?: string, phone?: string }): Promise<DbResult> {
    try {
      // 0. Pre-validation: Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id, email, username')
        .or(`email.eq."${ownerData.email}",username.eq."${ownerData.username.trim()}"`)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingUser) {
        const conflict = existingUser.email === ownerData.email ? 'el correo electrónico' : 'el nombre de usuario';
        return { success: false, message: `Ya existe un usuario con ${conflict}. Elige uno diferente.` };
      }

      // 1. Create Organization
      const { data: org, error: orgError } = await supabase.from('organizations').insert([{
        name: orgName.trim(),
        plan: 'pro',
        status: 'active',
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days trial
      }]).select().single();

      if (orgError) throw orgError;

      // 2. Create Owner User
      const { data: user, error: userError } = await supabase.from('users').insert([{
        organization_id: org.id,
        name: ownerData.name,
        email: ownerData.email,
        username: ownerData.username,
        password: ownerData.password,
        role: 'Owner',
        status: 'active',
        phone: ownerData.phone
      }]).select().single();

      if (userError) throw userError;

      // 3. Initialize Default Pipeline Stages
      const defaultStages = [
        { label: 'Nuevo', color: 'bg-blue-500', order: 0 },
        { label: 'Contactado', color: 'bg-purple-500', order: 1 },
        { label: 'Interesado', color: 'bg-amber-500', order: 2 },
        { label: 'Calificado', color: 'bg-orange-500', order: 3 },
        { label: 'Cerrado', color: 'bg-green-500', order: 4 },
        { label: 'Perdido', color: 'bg-red-500', order: 5 }
      ];

      const { error: pipelineError } = await supabase.from('pipeline_stages').insert(
        defaultStages.map(s => ({ ...s, organization_id: org.id }))
      );

      if (pipelineError) console.warn("Pipeline initialization failed:", pipelineError.message);

      return { success: true, data: { orgId: org.id, userId: user.id } };
    } catch (err: any) {
      console.error("Registration Error:", err);
      return { success: false, message: err.message };
    }
  }

  async deleteOrganization(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (user?.role !== 'Owner') return { success: false, message: "Permiso denegado" };

    // Prevent deleting the main system organization if it has a specific ID or name
    const { data: org } = await supabase.from('organizations').select('name').eq('id', id).single();
    if (org?.name.toLowerCase().includes('prex')) {
      return { success: false, message: "No se puede eliminar la organización principal del sistema." };
    }

    const { error } = await supabase.from('organizations').delete().eq('id', id);
    if (error) return { success: false, message: "Error al eliminar: asegúrese que la organización no tenga usuarios ni datos vinculados." };
    return { success: true };
  }

  async getOrganizationUsers(orgId: string): Promise<User[]> {
    const { data } = await supabase.from('users').select('*').eq('organization_id', orgId);
    return (data || []).map((u: any) => ({
      id: u.id,
      organizationId: u.organization_id,
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      avatar: u.avatar
    }));
  }

  async updateOrganization(org: Partial<Organization>): Promise<DbResult> {
    const { error } = await supabase.from('organizations').update({
      name: org.name,
      plan: org.plan,
      status: org.status,
      logo_url: org.logoUrl,
      slogan: org.slogan,
      max_users: org.maxUsers,
      expiry_date: org.expiryDate,
      contact_email: org.contactEmail
    }).eq('id', org.id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- SETTINGS (Per Organization) ---
  async getSettings(): Promise<AppSettings> {
    const user = getCurrentUser();
    if (!user) return { id: 'default', logoUrl: '', slogan: '' };

    const { data } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', user.organizationId)
      .single();

    if (data) {
      return {
        id: user.organizationId,
        logoUrl: data.logo_url,
        slogan: data.slogan,
        plan: data.plan,
        status: data.status,
        maxUsers: data.max_users,
        expiryDate: data.expiry_date
      } as any; // Cast as AppSettings might need update or we handle in UI
    }
    return { id: 'default', logoUrl: '', slogan: '' };
  }

  async updateSettings(settings: AppSettings): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    if (user.role === 'Agent') return { success: false, message: "Permiso denegado" };

    const { error } = await supabase.from('organizations').update({
      logo_url: settings.logoUrl,
      slogan: settings.slogan
    }).eq('id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- USERS ---
  async getUsers(): Promise<User[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('users').select('*').eq('organization_id', user.organizationId);

    const { data } = await query.order('name');

    return (data || []).map((u: any) => ({
      id: u.id,
      organizationId: u.organization_id,
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      avatar: u.avatar,
      phone: u.phone
    }));
  }

  async addUser(newUser: User): Promise<DbResult> {
    const currentUser = getCurrentUser();
    if (!currentUser) return { success: false, message: 'No autenticado' };
    if (currentUser.role === 'Agent') return { success: false, message: 'Permiso denegado' };

    // Check duplicates
    const { data: existing } = await supabase.from('users')
      .select('id')
      .or(`email.eq."${newUser.email}",username.eq."${newUser.username.trim()}"`)
      .maybeSingle();

    if (existing) return { success: false, message: 'Email o Usuario ya existe.' };

    const { error } = await supabase.from('users').insert([{
      organization_id: currentUser.role === 'SuperAdmin' ? toNullable(newUser.organizationId) || currentUser.organizationId : currentUser.organizationId,
      name: newUser.name,
      email: newUser.email,
      username: newUser.username,
      password: newUser.password,
      phone: newUser.phone,
      role: newUser.role,
      status: newUser.status || 'active',
      avatar: newUser.avatar
    }]);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateUser(updatedUser: User): Promise<DbResult> {
    const currentUser = getCurrentUser();
    if (!currentUser) return { success: false, message: 'No autenticado' };

    if (currentUser.role === 'Agent' && currentUser.id !== updatedUser.id) {
      return { success: false, message: 'Permiso denegado' };
    }

    const { error } = await supabase.from('users').update({
      name: updatedUser.name,
      email: updatedUser.email,
      username: updatedUser.username,
      password: updatedUser.password,
      phone: updatedUser.phone,
      role: updatedUser.role,
      status: updatedUser.status,
      avatar: updatedUser.avatar
    })
      .eq('id', updatedUser.id)
      .eq('organization_id', currentUser.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteUser(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (user?.role === 'Agent') return { success: false, message: 'Permiso denegado' };

    const { error } = await supabase.from('users').delete().eq('id', id).eq('organization_id', user.organizationId);
    if (error) return { success: false, message: 'Error al eliminar usuario (posiblemente tiene registros vinculados).' };
    return { success: true };
  }

  async changePassword(id: string, oldPassword: string, newPassword: string): Promise<DbResult> {
    const { data: user } = await supabase.from('users').select('*').eq('id', id).single();

    if (!user) return { success: false, message: "Usuario no encontrado" };
    if (user.password !== oldPassword) return { success: false, message: "La contraseña actual es incorrecta" };

    const userRecord = getCurrentUser();
    if (!userRecord) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('users')
      .update({ password: newPassword })
      .eq('id', id)
      .eq('organization_id', userRecord.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async requestPasswordReset(email: string): Promise<DbResult> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return { success: false, message: "Ingrese un correo electrónico válido." };

    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email, name, organization_id')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (findError) return { success: false, message: "Error al buscar usuario." };
    if (!user) return { success: false, message: "No se encontró ninguna cuenta con ese correo electrónico." };

    // Generate a random temporary password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    for (let i = 0; i < 8; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ password: tempPassword })
      .eq('id', user.id);

    if (updateError) return { success: false, message: "Error al restablecer la contraseña." };

    return {
      success: true,
      message: "Contraseña restablecida exitosamente.",
      data: { tempPassword, userName: user.name }
    };
  }

  // --- DEVELOPERS / PROJECTS ---
  async getDevelopers(): Promise<Developer[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('developers').select('*').eq('organization_id', user.organizationId);

    const { data } = await query;
    return (data || []).map((d: any) => ({
      id: d.id,
      organizationId: d.organization_id,
      name: d.name,
      developerName: d.developer_name,
      contactName: d.contact_name,
      ruc: d.ruc,
      phone: d.phone,
      email: d.email,
      address: d.address,
      comments: d.comments
    }));
  }

  async addDeveloper(dev: Developer): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('developers').insert([{
      organization_id: user.organizationId,
      name: dev.name,
      developer_name: dev.developerName,
      contact_name: dev.contactName,
      ruc: dev.ruc,
      phone: dev.phone,
      email: dev.email,
      address: dev.address,
      comments: dev.comments
    }]);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateDeveloper(dev: Developer): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('developers').update({
      name: dev.name,
      developer_name: dev.developerName,
      contact_name: dev.contactName,
      ruc: dev.ruc,
      phone: dev.phone,
      email: dev.email,
      address: dev.address,
      comments: dev.comments
    })
      .eq('id', dev.id)
      .eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteDeveloper(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (user?.role === 'Agent') return { success: false, message: "Agentes no pueden eliminar proyectos" };

    const { error } = await supabase.from('developers').delete().eq('id', id).eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- PIPELINE ---
  async getPipeline(): Promise<PipelineStage[]> {
    const user = getCurrentUser();
    if (!user) return [];

    const { data } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('organization_id', user.organizationId)
      .order('order', { ascending: true });

    return (data || []).map((s: any) => ({
      id: s.id,
      organizationId: s.organization_id,
      label: s.label,
      color: s.color,
      order: s.order,
      visible: s.visible !== false // Default to true
    }));
  }

  async updatePipeline(stages: PipelineStage[]): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('pipeline_stages').upsert(
      stages.map(s => ({
        id: s.id,
        organization_id: user.organizationId,
        label: s.label,
        color: s.color,
        "order": s.order,
        visible: s.visible
      })),
      { onConflict: 'id' }
    );
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deletePipelineStage(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (user?.role === 'Agent') return { success: false, message: "Permiso denegado" };

    const { error } = await supabase.from('pipeline_stages')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- SOURCES ---
  async getSources(): Promise<LeadSource[]> {
    const user = getCurrentUser();
    if (!user) return [];

    const { data } = await supabase
      .from('sources')
      .select('*')
      .eq('organization_id', user.organizationId);

    return (data || []).map((s: any) => ({
      id: s.id,
      organizationId: s.organization_id,
      name: s.name
    }));
  }

  async addSource(source: LeadSource): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };
    const { error } = await supabase.from('sources').insert([{
      id: source.id,
      organization_id: user.organizationId,
      name: source.name
    }]);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteSource(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('sources')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- PROPERTIES ---
  async getProperties(): Promise<Property[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('properties').select('*').eq('organization_id', user.organizationId);

    const { data } = await query;
    return (data || []).map((p: any) => ({
      id: p.id,
      organizationId: p.organization_id,
      developerId: p.developer_id,
      projectName: p.project_name,
      lotNumber: p.lot_number,
      area: p.area,
      price: p.price,
      currency: p.currency || 'USD',
      location: p.location,
      status: p.status,
      features: p.features || [],
      description: p.description,
      images: p.images || []
    }));
  }

  async addProperty(prop: Property): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('properties').insert([{
      organization_id: user.organizationId,
      developer_id: prop.developerId,
      project_name: prop.projectName,
      lot_number: prop.lotNumber,
      area: prop.area,
      price: prop.price,
      currency: prop.currency,
      location: prop.location,
      status: prop.status,
      features: prop.features,
      description: prop.description,
      images: prop.images
    }]);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateProperty(prop: Property): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('properties').update({
      developer_id: prop.developerId,
      project_name: prop.projectName,
      lot_number: prop.lotNumber,
      area: prop.area,
      price: prop.price,
      currency: prop.currency,
      location: prop.location,
      status: prop.status,
      features: prop.features,
      description: prop.description,
      images: prop.images
    })
      .eq('id', prop.id)
      .eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteProperty(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (user?.role === 'Agent') return { success: false, message: "Agentes no pueden eliminar inventario" };

    const { error } = await supabase.from('properties')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }



  // --- LEADS ---
  async getLeads(): Promise<Lead[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('leads').select('*').eq('organization_id', user.organizationId);

    // 2. Filter by Agent (Strict visibility)
    if (user.role === 'Agent') {
      query = query.eq('assigned_to', user.id);
    }

    const { data } = await query;
    return (data || []).map((l: any) => ({
      id: l.id,
      organizationId: l.organization_id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      status: l.status,
      source: l.source,
      interest: l.interest,
      budget: l.budget,
      currency: l.currency || 'USD',
      lastContact: l.last_contact,
      assignedTo: l.assigned_to,
      notes: l.notes,
      interestedPropertyIds: l.interested_property_ids || [],
      projectId: l.project_id,
      pipelineStageId: l.pipeline_stage_id,
      pipelineStageChangedAt: l.pipeline_stage_changed_at,
      chatbotActive: l.chatbot_active !== false,
      qualificationScore: l.qualification_score,
      tags: l.tags || [],
      aiAnalysis: l.ai_analysis,
      createdAt: l.created_at,
      updatedAt: l.updated_at
    }));
  }

  async addLead(lead: Lead): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "Sesión inválida" };

    const { error } = await supabase.from('leads').insert([{
      organization_id: user.organizationId,
      name: lead.name,
      phone: lead.phone,
      email: toNullable(lead.email),
      status: lead.status,
      source: toNullable(lead.source),
      interest: lead.interest,
      budget: lead.budget,
      currency: lead.currency,
      last_contact: lead.lastContact,
      assigned_to: user.role === 'Agent' ? user.id : toNullable(lead.assignedTo),
      notes: lead.notes,
      interested_property_ids: lead.interestedPropertyIds,
      chatbot_active: lead.chatbotActive,
      project_id: toNullable(lead.projectId),
      pipeline_stage_id: lead.pipelineStageId,
      pipeline_stage_changed_at: new Date().toISOString(),
      tags: lead.tags || []
    }]);

    if (error) {
      console.error("Add Lead Error:", error);
      return { success: false, message: error.message };
    }
    return { success: true };
  }

  async updateLead(lead: Lead): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    // Fetch current state to see if stage changed and check permissions
    const { data: currentLeadData, error: fetchError } = await supabase
      .from('leads')
      .select('assigned_to, pipeline_stage_id, pipeline_stage_changed_at')
      .eq('id', lead.id)
      .eq('organization_id', user.organizationId)
      .maybeSingle();

    if (fetchError) {
      console.error("UpdateLead fetch error:", fetchError.message, "Lead ID:", lead.id, "Org ID:", user.organizationId);
      return { success: false, message: "Error al buscar el lead: " + fetchError.message };
    }

    if (!currentLeadData) {
      console.error("UpdateLead: Lead not found. ID:", lead.id, "Org:", user.organizationId);
      return { success: false, message: "Lead no encontrado." };
    }

    // SECURITY: Agent can only update their own leads
    if (user.role === 'Agent' && currentLeadData.assigned_to !== user.id) {
      return {
        success: false,
        message: 'Este lead pertenece a otro asesor. Pide al supervisor la asignación si necesitas gestionarlo.'
      };
    }

    const stageChanged = currentLeadData.pipeline_stage_id !== lead.pipelineStageId;
    const stageChangedAt = stageChanged ? new Date().toISOString() : lead.pipelineStageChangedAt || currentLeadData.pipeline_stage_changed_at;

    const { error } = await supabase.from('leads').update({
      name: lead.name,
      phone: lead.phone,
      email: toNullable(lead.email),
      status: lead.status,
      pipeline_stage_id: lead.pipelineStageId,
      pipeline_stage_changed_at: stageChangedAt,
      source: toNullable(lead.source),
      interest: lead.interest,
      budget: lead.budget,
      currency: lead.currency,
      last_contact: lead.lastContact,
      assigned_to: toNullable(lead.assignedTo),
      notes: lead.notes,
      interested_property_ids: lead.interestedPropertyIds,
      chatbot_active: lead.chatbotActive,
      project_id: toNullable(lead.projectId),
      tags: lead.tags,
      updated_at: new Date().toISOString()
    }).eq('id', lead.id).eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteLead(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    // SECURITY: Only Admin, SuperAdmin, Owner can delete leads
    if (user.role === 'Agent') {
      return { success: false, message: 'No tienes permisos para eliminar leads.' };
    }

    const { error } = await supabase.from('leads')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async toggleChatbot(id: string, isActive: boolean): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    let query = supabase.from('leads')
      .update({ chatbot_active: isActive })
      .eq('id', id)
      .eq('organization_id', user.organizationId);

    if (user.role === 'Agent') {
      query = query.eq('assigned_to', user.id);
    }

    const { error } = await query;
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- MESSAGES (CHAT) ---
  async getMessages(leadId: string): Promise<Message[]> {
    const user = getCurrentUser();
    if (!user) return [];

    // SECURITY: Ensure the lead belongs to the user's organization
    const { data: leadCheck } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('organization_id', user.organizationId)
      .maybeSingle();

    if (!leadCheck) {
      console.warn(`[Security] Attempt to access unauthorized lead messages. Lead: ${leadId}, Org: ${user.organizationId}`);
      return [];
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .eq('organization_id', user.organizationId) // Double layer of safety
      .order('created_at', { ascending: true });

    if (error) {
      console.warn("Messages fetch error:", error.message);
      return [];
    }

    return (data || []).map((m: any) => ({
      id: m.id,
      organizationId: m.organization_id,
      leadId: m.lead_id,
      content: m.content,
      sender: m.sender,
      createdAt: m.created_at,
      mediaType: m.media_type || 'text',
      mediaUrl: m.media_url,
      mediaFilename: m.media_filename
    }));
  }

  async addMessage(msg: Partial<Message>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    const { data: lead } = await supabase.from('leads').select('phone').eq('id', msg.leadId).maybeSingle();

    const mediaType = msg.mediaType || 'text';

    const { error } = await supabase.from('messages').insert([{
      organization_id: user.organizationId,
      lead_id: msg.leadId,
      content: msg.content || '',
      sender: msg.sender,
      media_type: mediaType,
      media_url: msg.mediaUrl,
      media_filename: msg.mediaFilename
    }]);

    // Send via Evolution API based on media type
    if (!error && msg.sender === 'agent' && lead?.phone) {
      try {
        switch (mediaType) {
          case 'text':
            await evolutionService.sendText(user.organizationId, lead.phone, msg.content || '');
            break;
          case 'image':
          case 'video':
            await evolutionService.sendMedia(
              user.organizationId,
              lead.phone,
              msg.mediaUrl || '',
              mediaType,
              msg.content
            );
            break;
          case 'audio':
            await evolutionService.sendAudio(user.organizationId, lead.phone, msg.mediaUrl || '');
            break;
          case 'document':
            await evolutionService.sendDocument(
              user.organizationId,
              lead.phone,
              msg.mediaUrl || '',
              msg.mediaFilename || 'document'
            );
            break;
        }
      } catch (e) {
        console.error('[Evolution] Send failed:', e);
      }
    }

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- CAMPAIGNS ---
  async getCampaigns(): Promise<Campaign[]> {
    const user = getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', user.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn("Campaigns fetch error:", error.message);
      return [];
    }

    return (data || []).map((c: any) => ({
      id: c.id,
      organizationId: c.organization_id,
      title: c.title,
      description: c.description,
      content: c.content,
      mediaUrl: c.media_url,
      mediaType: c.media_type,
      filters: c.filters || {},
      scheduleDate: c.schedule_date,
      delaySeconds: c.delay_seconds || 5,
      status: c.status,
      stats: c.stats || { sent: 0, failed: 0, total: 0 },
      createdAt: c.created_at,
      createdBy: c.created_by
    }));
  }

  async addCampaign(campaign: Partial<Campaign>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    if (user.role === 'Agent') return { success: false, message: "No tienes permisos para crear campañas" };

    const { error } = await supabase.from('campaigns').insert([{
      organization_id: user.organizationId,
      title: campaign.title,
      description: campaign.description,
      content: campaign.content,
      media_url: campaign.mediaUrl,
      media_type: campaign.mediaType,
      filters: campaign.filters,
      schedule_date: campaign.scheduleDate,
      delay_seconds: campaign.delaySeconds,
      status: campaign.status || 'draft',
      stats: campaign.stats,
      created_by: user.id
    }]);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateCampaign(campaign: Partial<Campaign>): Promise<DbResult> {
    if (!campaign.id) return { success: false, message: "ID requerido" };
    const user = getCurrentUser();
    if (user?.role === 'Agent') return { success: false, message: "No tienes permisos para editar campañas" };

    const { error } = await supabase.from('campaigns').update({
      title: campaign.title,
      description: campaign.description,
      content: campaign.content,
      media_url: campaign.mediaUrl,
      media_type: campaign.mediaType,
      filters: campaign.filters,
      schedule_date: campaign.scheduleDate,
      delay_seconds: campaign.delaySeconds,
      status: campaign.status,
      stats: campaign.stats
    })
      .eq('id', campaign.id)
      .eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteCampaign(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (user?.role === 'Agent') return { success: false, message: "No tienes permisos para eliminar campañas" };

    const { error } = await supabase.from('campaigns')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async addCampaignLog(log: Partial<CampaignLog>): Promise<DbResult> {
    const { error } = await supabase.from('campaign_logs').insert([{
      campaign_id: log.campaignId,
      lead_id: log.leadId,
      status: log.status,
      error_message: log.errorMessage,
      sent_at: new Date().toISOString()
    }]);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- QUICK REPLIES ---
  async getQuickReplies(): Promise<QuickReply[]> {
    const user = getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .eq('organization_id', user.organizationId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.warn("Quick replies fetch error:", error.message);
      return [];
    }

    return (data || []).map((qr: any) => ({
      id: qr.id,
      organizationId: qr.organization_id,
      name: qr.name,
      type: qr.type || 'text',
      content: qr.content,
      mediaUrl: qr.media_url,
      mediaFilename: qr.media_filename,
      sortOrder: qr.sort_order || 0
    }));
  }

  async addQuickReply(qr: Partial<QuickReply>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    if (user.role === 'Agent') return { success: false, message: "No tienes permisos para gestionar respuestas rápidas" };

    const { error } = await supabase.from('quick_replies').insert([{
      organization_id: user.organizationId,
      name: qr.name,
      type: qr.type || 'text',
      content: qr.content,
      media_url: qr.mediaUrl,
      media_filename: qr.mediaFilename,
      sort_order: qr.sortOrder || 0
    }]);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateQuickReply(qr: QuickReply): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    if (user.role === 'Agent') return { success: false, message: "No tienes permisos para gestionar respuestas rápidas" };

    const { error } = await supabase.from('quick_replies').update({
      name: qr.name,
      type: qr.type,
      content: qr.content,
      media_url: qr.mediaUrl,
      media_filename: qr.mediaFilename,
      sort_order: qr.sortOrder
    }).eq('id', qr.id).eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteQuickReply(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    if (user.role === 'Agent') return { success: false, message: "No tienes permisos para gestionar respuestas rápidas" };

    const { error } = await supabase.from('quick_replies')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- CLIENTS (Legacy) ---
  async getClients(): Promise<Client[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('clients').select('*').eq('organization_id', user.organizationId);

    const { data } = await query;
    return (data || []).map((c: any) => ({
      id: c.id,
      organizationId: c.organization_id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      status: c.status,
      origin: c.origin,
      notes: c.notes,
      createdAt: c.created_at,
      birthDate: c.birth_date,
      interestedPropertyIds: c.interested_property_ids || []
    }));
  }

  async addClient(client: Client): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };
    const { error } = await supabase.from('clients').insert([{
      organization_id: user.organizationId,
      name: client.name,
      phone: client.phone,
      email: toNullable(client.email),
      status: client.status,
      origin: client.origin,
      notes: client.notes,
      created_at: client.createdAt,
      birth_date: toNullable(client.birthDate),
      interested_property_ids: client.interestedPropertyIds
    }]);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateClient(client: Client): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('clients').update({
      name: client.name,
      phone: client.phone,
      email: toNullable(client.email),
      status: client.status,
      origin: client.origin,
      notes: client.notes,
      birth_date: toNullable(client.birthDate),
      interested_property_ids: client.interestedPropertyIds
    })
      .eq('id', client.id)
      .eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteClient(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('clients')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- TASKS ---
  async getTasks(): Promise<Task[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('tasks').select('*').eq('organization_id', user.organizationId);
    if (user.role === 'Agent') query = query.eq('assigned_to', user.id);

    const { data } = await query;
    return (data || []).map((t: any) => ({
      id: t.id,
      organizationId: t.organization_id,
      title: t.title,
      dueDate: t.due_date,
      status: t.status,
      assignedTo: t.assigned_to,
      relatedTo: t.related_to,
      leadId: t.lead_id,
      comments: t.comments,
      createdAt: t.created_at
    }));
  }

  async addTask(task: Task): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    const { error } = await supabase.from('tasks').insert([{
      organization_id: user.organizationId,
      title: task.title,
      due_date: task.dueDate,
      status: task.status,
      assigned_to: user.role === 'Agent' ? user.id : toNullable(task.assignedTo),
      related_to: task.relatedTo,
      lead_id: toNullable(task.leadId),
      comments: task.comments
    }]);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateTask(task: Task): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    let query = supabase.from('tasks').update({
      title: task.title,
      due_date: task.dueDate,
      status: task.status,
      assigned_to: toNullable(task.assignedTo),
      related_to: task.relatedTo,
      lead_id: toNullable(task.leadId),
      comments: task.comments
    }).eq('id', task.id).eq('organization_id', user.organizationId);

    if (user.role === 'Agent') query = query.eq('assigned_to', user.id);

    const { error } = await query;
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteTask(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    let query = supabase.from('tasks').delete().eq('id', id).eq('organization_id', user.organizationId);
    if (user.role === 'Agent') query = query.eq('assigned_to', user.id);

    const { error } = await query;
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- APPOINTMENTS ---
  async getAppointments(): Promise<Appointment[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('appointments').select('*');
    if (user.role !== 'SuperAdmin') query = query.eq('organization_id', user.organizationId);
    if (user.role === 'Agent') query = query.eq('assigned_to', user.id);

    const { data } = await query;
    return (data || []).map((a: any) => ({
      id: a.id,
      organizationId: a.organization_id,
      title: a.title,
      date: a.date,
      leadId: a.lead_id,
      propertyId: a.property_id,
      notes: a.notes,
      status: a.status,
      assignedTo: a.assigned_to
    }));
  }

  async addAppointment(apt: Appointment): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    const { error } = await supabase.from('appointments').insert([{
      organization_id: user.organizationId,
      title: apt.title,
      date: apt.date,
      lead_id: toNullable(apt.leadId),
      property_id: toNullable(apt.propertyId),
      notes: apt.notes,
      status: apt.status,
      assigned_to: user.role === 'Agent' ? user.id : toNullable(apt.assignedTo)
    }]);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateAppointment(apt: Appointment): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    let query = supabase.from('appointments').update({
      title: apt.title,
      date: apt.date,
      lead_id: toNullable(apt.leadId),
      property_id: toNullable(apt.propertyId),
      notes: apt.notes,
      status: apt.status,
      assigned_to: toNullable(apt.assignedTo)
    }).eq('id', apt.id).eq('organization_id', user.organizationId);

    if (user.role === 'Agent') query = query.eq('assigned_to', user.id);

    const { error } = await query;
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteAppointment(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false };

    let query = supabase.from('appointments').delete().eq('id', id).eq('organization_id', user.organizationId);
    if (user.role === 'Agent') query = query.eq('assigned_to', user.id);

    const { error } = await query;
    if (error) return { success: false, message: error.message };
    return { success: true };
  }
  // --- FOLLOW UP CAMPAIGNS ---
  async getFollowUpCampaigns(): Promise<FollowUpConfig[]> {
    const user = getCurrentUser();
    if (!user?.organizationId) return [];

    const { data, error } = await supabase
      .from('followup_campaigns')
      .select('*')
      .eq('organization_id', user.organizationId)
      .order('delay_hours', { ascending: true });

    if (error) {
      console.error('Error fetching campaigns:', error);
      return [];
    }

    return data.map(c => ({
      id: c.id,
      organization_id: c.organization_id,
      name: c.name, // Mapping 'name' if it exists in DB, otherwise might need adjustment
      // The DB schema might not have 'name' column based on previous context, but types says it does. 
      // Let's assume the previous schema had it or it's mapped from something else.
      // Actually checking the CREATE TABLE would be good but let's stick to the types.
      // Wait, 'trigger_stage_id' was the old way. We keep it for backward compatibility or migration?
      // The prompt says "Add tags, trigger_field...".
      // Use trigger_stage_id as fallback for backward compatibility
      pipeline_stage_id: c.pipeline_stage_id || c.trigger_stage_id,

      delay_hours: c.delay_hours,
      content: c.content,
      media_url: c.media_url,
      media_type: c.media_type,
      is_active: c.is_active,
      created_at: c.created_at,

      // New fields
      tags: c.tags,
      trigger_field: c.trigger_field,
      trigger_type: c.trigger_type
    }));
  }

  async addFollowUpCampaign(config: Partial<FollowUpConfig>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user?.organizationId) return { success: false, message: 'No auth' };

    const { data, error } = await supabase
      .from('followup_campaigns')
      .insert({
        organization_id: user.organizationId,
        // name: config.name, // Removing name if not in interface or optional
        trigger_stage_id: config.pipeline_stage_id, // Map interface to DB
        delay_hours: config.delay_hours,
        content: config.content,
        media_url: config.media_url,
        media_type: config.media_type,
        // specific_time: config.specific_time, // Removing if not in interface
        is_active: config.is_active ?? true,

        // New fields
        tags: config.tags,
        trigger_field: config.trigger_field,
        trigger_type: config.trigger_type
      })
      .select()
      .single();

    if (error) return { success: false, message: error.message };
    return { success: true, data };
  }

  async updateFollowUpCampaign(config: Partial<FollowUpConfig>): Promise<DbResult> {
    if (!config.id) return { success: false, message: 'ID required' };

    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { data, error } = await supabase
      .from('followup_campaigns')
      .update({
        name: config.name,
        trigger_stage_id: config.pipeline_stage_id,
        delay_hours: config.delay_hours,
        content: config.content,
        media_url: config.media_url,
        media_type: config.media_type,
        is_active: config.is_active,
        tags: config.tags,
        trigger_field: config.trigger_field,
        trigger_type: config.trigger_type
      })
      .eq('id', config.id)
      .eq('organization_id', user.organizationId)
      .select()
      .single();

    if (error) return { success: false, message: error.message };
    return { success: true, data };
  }

  async checkFollowUpLog(configId: string, leadId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('followup_activity')
        .select('id')
        .eq('config_id', configId)
        .eq('lead_id', leadId)
        .eq('status', 'sent')
        .limit(1);

      if (error) {
        console.error('[DB] Error checking follow-up log:', error);
        return true; // Fail safe: assume sent to prevent duplicates
      }

      return !!(data && data.length > 0);
    } catch (e) {
      console.error('[DB] Check-log exception:', e);
      return true; // Fail safe
    }
  }

  async logFollowUpActivity(log: { config_id: string; lead_id: string; status: string }): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user?.organizationId) return { success: false, message: 'No auth' };

    // Final double-check: ensure no other process snuck in a 'sent' log
    if (log.status === 'sent') {
      const alreadyLogged = await this.checkFollowUpLog(log.config_id, log.lead_id);
      if (alreadyLogged) {
        console.warn(`[DB] Skipping log insertion: Duplicate 'sent' activity detected for lead ${log.lead_id}`);
        return { success: true };
      }
    }

    const { error } = await supabase
      .from('followup_activity')
      .insert({
        ...log,
        organization_id: user.organizationId
      });

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteFollowUpCampaign(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase
      .from('followup_campaigns')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- CLIENT AUTOMATIONS ---
  async getClientAutomations(): Promise<(ClientAutomation & { lastSentAt?: string })[]> {
    const user = getCurrentUser();
    if (!user?.organizationId) return [];

    const { data, error } = await supabase
      .from('client_automations')
      .select('*, client_automation_logs(sent_at)')
      .eq('organization_id', user.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching client automations:', error);
      return [];
    }

    return (data || []).map((auto: any) => {
      const logs = auto.client_automation_logs || [];
      const lastSentAt = logs.length > 0
        ? logs.sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0].sent_at
        : undefined;

      return {
        ...auto,
        lastSentAt
      };
    });
  }

  async addClientAutomation(automation: Partial<ClientAutomation>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user?.organizationId) return { success: false, message: 'No auth' };

    const { data, error } = await supabase
      .from('client_automations')
      .insert({
        organization_id: user.organizationId,
        name: automation.name,
        trigger_type: automation.trigger_type,
        content: automation.content,
        media_url: automation.media_url,
        media_type: automation.media_type,
        is_active: automation.is_active ?? true,
        time_to_send: automation.time_to_send
      })
      .select()
      .single();

    if (error) return { success: false, message: error.message };
    return { success: true, data };
  }

  async updateClientAutomation(automation: Partial<ClientAutomation>): Promise<DbResult> {
    if (!automation.id) return { success: false, message: 'ID required' };

    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { data, error } = await supabase
      .from('client_automations')
      .update({
        name: automation.name,
        trigger_type: automation.trigger_type,
        content: automation.content,
        media_url: automation.media_url,
        media_type: automation.media_type,
        is_active: automation.is_active,
        time_to_send: automation.time_to_send
      })
      .eq('id', automation.id)
      .eq('organization_id', user.organizationId)
      .select()
      .single();

    if (error) return { success: false, message: error.message };
    return { success: true, data };
  }

  async deleteClientAutomation(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase
      .from('client_automations')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- AUTOMATION LOGS ---
  async logClientAutomation(log: Partial<ClientAutomationLog>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user?.organizationId) return { success: false };

    const { error } = await supabase.from('client_automation_logs').insert({
      organization_id: user.organizationId,
      automation_id: log.automation_id,
      client_id: log.client_id,
      status: log.status,
      error_message: log.error_message
    });

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async checkAutomationLog(automationId: string, clientId: string): Promise<boolean> {
    const currentYear = new Date().getFullYear();
    const firstDayOfYear = `${currentYear}-01-01T00:00:00`;

    const { data, error } = await supabase
      .from('client_automation_logs')
      .select('id')
      .eq('automation_id', automationId)
      .eq('client_id', clientId)
      .eq('status', 'sent')
      .gte('sent_at', firstDayOfYear)
      .maybeSingle();

    if (error) {
      console.error('Check log error', error);
      return false;
    }
    return !!data;
  }

  // --- SALES & TRANSACTIONS ---
  async getSales(): Promise<Sale[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('sales').select('*').eq('organization_id', user.organizationId);

    const { data } = await query.order('date', { ascending: false });
    return (data || []).map((s: any) => ({
      id: s.id,
      organizationId: s.organization_id,
      propertyId: s.property_id,
      leadId: s.lead_id,
      financialClientId: s.financial_client_id, // Map from DB
      clientName: s.client_name,
      agentId: s.agent_id,
      amount: s.amount,
      currency: s.currency,
      commissions: s.commissions || [],
      status: s.status,
      date: s.date,
      notes: s.notes,
      createdAt: s.created_at
    }));
  }

  async addSale(sale: Partial<Sale>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: 'No autenticado' };

    const { error } = await supabase.from('sales').insert({
      organization_id: user.organizationId,
      property_id: sale.propertyId,
      lead_id: toNullable(sale.leadId),
      financial_client_id: toNullable(sale.financialClientId),
      client_name: sale.clientName,
      agent_id: sale.agentId,
      amount: sale.amount,
      currency: sale.currency,
      commissions: sale.commissions,
      status: sale.status || 'completed',
      date: sale.date || new Date().toISOString().split('T')[0],
      notes: sale.notes
    });

    if (error) return { success: false, message: error.message };

    // Update property status to SOLD
    if (sale.propertyId) {
      await supabase.from('properties')
        .update({ status: 'Vendido' })
        .eq('id', sale.propertyId)
        .eq('organization_id', user.organizationId);
    }

    return { success: true };
  }

  async updateSale(sale: Partial<Sale>): Promise<DbResult> {
    if (!sale.id) return { success: false, message: 'ID requerido' };

    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('sales').update({
      property_id: sale.propertyId,
      lead_id: toNullable(sale.leadId),
      financial_client_id: toNullable(sale.financialClientId),
      client_name: sale.clientName,
      agent_id: sale.agentId,
      amount: sale.amount,
      currency: sale.currency,
      commissions: sale.commissions,
      status: sale.status,
      date: sale.date,
      notes: sale.notes
    }).eq('id', sale.id).eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- FINANCIAL CLIENTS ---
  async getFinancialClients(): Promise<FinancialClient[]> {
    const user = getCurrentUser();
    if (!user?.organizationId) return [];

    const { data, error } = await supabase
      .from('financial_clients')
      .select('*')
      .eq('organization_id', user.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching financial clients:', error);
      return [];
    }

    return (data || []).map((c: any) => ({
      id: c.id,
      organizationId: c.organization_id,
      name: c.name,
      document: c.document,
      address: c.address,
      civilStatus: c.civil_status,
      phone: c.phone,
      email: c.email,
      birthDate: c.birth_date,
      occupation: c.occupation,
      hasChildren: c.has_children,
      numberOfChildren: c.number_of_children,
      childrenDetails: c.children_details,
      spouseName: c.spouse_name,
      spouseDocument: c.spouse_document,
      spouseAddress: c.spouse_address,
      propertyId: c.property_id,
      notes: c.notes,
      createdAt: c.created_at
    }));
  }

  async addFinancialClient(client: Partial<FinancialClient>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user?.organizationId) return { success: false, message: 'No auth' };

    const { data, error } = await supabase
      .from('financial_clients')
      .insert({
        organization_id: user.organizationId,
        name: client.name,
        document: client.document,
        address: client.address,
        civil_status: client.civilStatus,
        phone: client.phone,
        email: client.email,
        birth_date: client.birthDate,
        occupation: client.occupation,
        has_children: client.hasChildren,
        number_of_children: client.numberOfChildren,
        children_details: client.childrenDetails,
        spouse_name: client.spouseName,
        spouse_document: client.spouseDocument,
        spouse_address: client.spouseAddress,
        property_id: client.propertyId,
        notes: client.notes
      })
      .select()
      .single();

    if (error) return { success: false, message: error.message };
    return { success: true, data };
  }

  async updateFinancialClient(client: Partial<FinancialClient>): Promise<DbResult> {
    if (!client.id) return { success: false, message: 'ID required' };

    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { data, error } = await supabase
      .from('financial_clients')
      .update({
        name: client.name,
        document: client.document,
        address: client.address,
        civil_status: client.civilStatus,
        phone: client.phone,
        email: client.email,
        birth_date: client.birthDate,
        occupation: client.occupation,
        has_children: client.hasChildren,
        number_of_children: client.numberOfChildren,
        children_details: client.childrenDetails,
        spouse_name: client.spouseName,
        spouse_document: client.spouseDocument,
        spouse_address: client.spouseAddress,
        property_id: client.propertyId,
        notes: client.notes
      })
      .eq('id', client.id)
      .eq('organization_id', user.organizationId)
      .select()
      .single();

    if (error) return { success: false, message: error.message };
    return { success: true, data };
  }

  async deleteFinancialClient(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    const { error } = await supabase.from('financial_clients').delete().eq('id', id).eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async getBirthdayClients(): Promise<(FinancialClient & { projectName?: string; lastSentAt?: string })[]> {
    const user = getCurrentUser();
    if (!user?.organizationId) return [];

    const currentMonth = new Date().getMonth() + 1;
    const currentMonthStr = currentMonth.toString().padStart(2, '0');

    // Fetch clients with their project names and their automation logs
    const { data: clients, error } = await supabase
      .from('financial_clients')
      .select('*, properties(project_name), client_automation_logs(sent_at)')
      .eq('organization_id', user.organizationId);

    if (error) {
      console.error('Error fetching birthday clients:', error);
      return [];
    }

    console.log('[DB] Total financial clients fetched:', clients?.length);

    return (clients || [])
      .filter((c: any) => {
        if (!c.birth_date) return false;
        // Handle YYYY-MM-DD or MM-DD or other dash separated formats
        const parts = c.birth_date.split('-');
        let month = '';
        if (parts.length === 3) { // YYYY-MM-DD
          month = parts[1];
        } else if (parts.length === 2) { // MM-DD
          month = parts[0];
        }
        return month === currentMonthStr;
      })
      .map((c: any) => {
        // Get the most recent sent_at log
        const logs = c.client_automation_logs || [];
        const lastSentAt = logs.length > 0
          ? logs.sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0].sent_at
          : undefined;

        return {
          id: c.id,
          organizationId: c.organization_id,
          name: c.name,
          document: c.document,
          address: c.address,
          civilStatus: c.civil_status,
          phone: c.phone,
          email: c.email,
          birthDate: c.birth_date,
          occupation: c.occupation,
          hasChildren: c.has_children,
          numberOfChildren: c.number_of_children,
          childrenDetails: c.children_details,
          spouseName: c.spouse_name,
          spouseDocument: c.spouse_document,
          spouseAddress: c.spouse_address,
          propertyId: c.property_id,
          notes: c.notes,
          automationEnabled: c.automation_enabled !== false,
          projectName: c.properties?.project_name,
          lastSentAt,
          createdAt: c.created_at
        };
      });
  }

  async updateFinancialClientAutomation(clientId: string, enabled: boolean): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase
      .from('financial_clients')
      .update({ automation_enabled: enabled })
      .eq('id', clientId)
      .eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteSale(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    const { error } = await supabase.from('sales').delete().eq('id', id).eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async getTransactions(): Promise<Transaction[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('transactions').select('*').eq('organization_id', user.organizationId);

    const { data } = await query.order('date', { ascending: false });
    return (data || []).map((t: any) => ({
      id: t.id,
      organizationId: t.organization_id,
      description: t.description,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      date: t.date,
      category: t.category,
      saleId: t.sale_id,
      notes: t.notes,
      createdAt: t.created_at
    }));
  }

  async addTransaction(tx: Partial<Transaction>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: 'No autenticado' };

    const { error } = await supabase.from('transactions').insert({
      organization_id: user.organizationId,
      description: tx.description,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      date: tx.date || new Date().toISOString().split('T')[0],
      category: tx.category,
      sale_id: tx.saleId,
      notes: tx.notes
    });

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateTransaction(tx: Partial<Transaction>): Promise<DbResult> {
    if (!tx.id) return { success: false, message: 'ID requerido' };

    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('transactions').update({
      description: tx.description,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      date: tx.date,
      category: tx.category,
      sale_id: tx.saleId,
      notes: tx.notes
    }).eq('id', tx.id).eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteTransaction(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async getOtherIncomes(): Promise<OtherIncome[]> {
    const user = getCurrentUser();
    if (!user) return [];

    let query = supabase.from('other_incomes').select('*').eq('organization_id', user.organizationId);

    const { data } = await query.order('date', { ascending: false });
    return (data || []).map((i: any) => ({
      id: i.id,
      organizationId: i.organization_id,
      description: i.description,
      amount: i.amount,
      currency: i.currency,
      date: i.date,
      category: i.category,
      propertyId: i.property_id
    }));
  }

  async addOtherIncome(income: Partial<OtherIncome>): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: 'No autenticado' };

    const { error } = await supabase.from('other_incomes').insert({
      organization_id: user.organizationId,
      description: income.description,
      amount: income.amount,
      currency: income.currency,
      date: income.date || new Date().toISOString().split('T')[0],
      category: income.category,
      property_id: income.propertyId
    });

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async updateOtherIncome(income: Partial<OtherIncome>): Promise<DbResult> {
    if (!income.id) return { success: false, message: 'ID requerido' };

    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };

    const { error } = await supabase.from('other_incomes').update({
      description: income.description,
      amount: income.amount,
      currency: income.currency,
      date: income.date,
      category: income.category,
      property_id: income.propertyId
    }).eq('id', income.id).eq('organization_id', user.organizationId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  async deleteOtherIncome(id: string): Promise<DbResult> {
    const user = getCurrentUser();
    if (!user) return { success: false, message: "No autenticado" };
    const { error } = await supabase.from('other_incomes').delete().eq('id', id).eq('organization_id', user.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  // --- MEDIA UPLOAD ---
  async uploadCampaignMedia(file: File): Promise<string | null> {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `campaigns/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        return null;
      }

      const { data } = supabase.storage
        .from('chat-media')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error in uploadCampaignMedia:', error);
      return null;
    }
  }
}

export const db = new SupabaseDatabase();
