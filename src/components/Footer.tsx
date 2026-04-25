
import React from 'react';
import { Link } from 'react-router-dom';
import { Dog, Instagram } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-secondary py-12 text-secondary-foreground">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Dog className="h-6 w-6 text-brand-primary" />
              <span className="text-xl font-bold">Vettale</span>
            </div>
            <p className="text-sm">
              Serviços premium de saúde e bem-estar para manter seu amigo peludo com a melhor aparência e saúde.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold text-lg mb-4">Links Rápidos</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="hover:text-brand-primary transition-colors">
                  Início
                </Link>
              </li>
              <li>
                <Link to="/services" className="hover:text-brand-primary transition-colors">
                  Serviços
                </Link>
              </li>
              <li>
                <Link to="/appointments" className="hover:text-brand-primary transition-colors">
                  Meus Agendamentos
                </Link>
              </li>
              <li>
                <Link to="/book" className="hover:text-brand-primary transition-colors">
                  Agendar Consulta
                </Link>
              </li>
              <li>
                <a
                  href="https://www.instagram.com/vettale.shop/?utm_source=website&utm_medium=footer&utm_campaign=instagram"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand-primary transition-colors flex items-center gap-1.5"
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </a>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-lg mb-4">Contato</h4>
            <address className="not-italic">
              <p>Alameda Prof. Lucas Nogueira Garcez, 4245 - Jardim Paulista</p>
              <p>Atibaia - SP, 12947-000, Brazil</p>
              <p className="mt-2">Email: contato@vettale.shop</p>
              <p>Telefone: (11) 2427-2827</p>
              <p>WhatsApp: (11) 99637-8518</p>
            </address>
          </div>
        </div>
        
        <div className="border-t border-muted mt-10 pt-6 text-sm text-center">
          <p>&copy; {new Date().getFullYear()} Vettale. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
