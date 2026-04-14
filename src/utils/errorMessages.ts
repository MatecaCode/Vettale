// Error message translation utility
// Maps Supabase and other English error messages to Portuguese

export const translateErrorMessage = (errorMessage: string): string => {
  const message = errorMessage.toLowerCase();
  
  // Email confirmation errors
  if (message.includes('email not confirmed') || message.includes('email_confirmed_at')) {
    return 'Email não confirmado. Verifique sua caixa de entrada e confirme seu email antes de fazer login.';
  }
  
  // Authentication errors
  if (message.includes('invalid login credentials') || message.includes('invalid email or password')) {
    return 'Email ou senha inválidos. Verifique suas credenciais e tente novamente.';
  }
  
  if (message.includes('user not found')) {
    return 'Usuário não encontrado. Verifique se o email está correto.';
  }
  
  if (message.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
  }
  
  // Registration errors
  if (message.includes('user already registered') || message.includes('already registered')) {
    return 'Este email já está registrado. Tente fazer login ou use outro email.';
  }
  
  if (message.includes('invalid email')) {
    return 'Email inválido. Verifique o formato do email.';
  }
  
  if (message.includes('password should be at least')) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  
  if (message.includes('signup is disabled')) {
    return 'Registros estão temporariamente desabilitados.';
  }
  
  // Network errors
  if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }
  
  // Generic errors
  if (message.includes('internal server error')) {
    return 'Erro interno do servidor. Tente novamente em alguns minutos.';
  }
  
  if (message.includes('service unavailable')) {
    return 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.';
  }
  
  // Rate limit errors
  if (message.includes('email rate limit') || message.includes('rate limit exceeded')) {
    return 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }

  if (message.includes('over_email_send_rate_limit') || message.includes('too many requests')) {
    return 'Limite de envios atingido. Aguarde alguns minutos e tente novamente.';
  }

  // Phone / OTP errors
  if (message.includes('phone') && message.includes('already registered')) {
    return 'Este número de telefone já está cadastrado. Tente fazer login.';
  }

  if (message.includes('invalid phone')) {
    return 'Número de telefone inválido. Use o formato internacional (ex: +55 11 99999-9999).';
  }

  if (message.includes('otp') || message.includes('token has expired') || message.includes('token is invalid')) {
    return 'Código inválido ou expirado. Solicite um novo código e tente novamente.';
  }

  if (message.includes('sms') && (message.includes('not enabled') || message.includes('disabled'))) {
    return 'Autenticação por SMS não está ativada no momento.';
  }

  // Default fallback
  return errorMessage || 'Erro desconhecido. Tente novamente.';
};

// Add spam folder note to email-related messages
export const addSpamFolderNote = (message: string): string => {
  const emailKeywords = ['email', 'confirmação', 'verificação', 'enviado', 'enviada'];
  const hasEmailContext = emailKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );
  
  if (hasEmailContext) {
    return `${message} Se não encontrar o email, verifique sua pasta de spam.`;
  }
  
  return message;
};

// Combined function for email-related errors
export const translateEmailError = (errorMessage: string): string => {
  const translated = translateErrorMessage(errorMessage);
  return addSpamFolderNote(translated);
};
