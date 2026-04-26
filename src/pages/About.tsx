import React from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Heart, Dog, Syringe, Cat, Award, Stethoscope } from 'lucide-react';
import { useScrollAnimation, animationClasses } from '@/hooks/useScrollAnimation';
import { Container } from '@/components/primitives';
import YouTubeEmbed from '@/components/YouTubeEmbed';

const About = () => {
  const heroAnimation         = useScrollAnimation<HTMLDivElement>({ delay: 100 });
  const historyAnimation      = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const historyImageAnimation = useScrollAnimation<HTMLDivElement>({ delay: 300 });
  const foundersAnimation     = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const foundersContentAnim   = useScrollAnimation<HTMLDivElement>({ delay: 300 });
  const valuesAnimation       = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const taxidogAnimation      = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const caominhadaAnimation   = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const teamAnimation         = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const teamImageAnimation    = useScrollAnimation<HTMLDivElement>({ delay: 300 });
  const todayAnimation        = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const todayImagesAnimation  = useScrollAnimation<HTMLDivElement>({ delay: 300 });
  const metricsAnimation      = useScrollAnimation<HTMLDivElement>({ delay: 400 });
  const legacyAnimation       = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const closingVideoAnimation = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const ctaAnimation          = useScrollAnimation<HTMLDivElement>({ delay: 200 });

  return (
    <Layout>
      {/* ── Hero ── */}
      <section className="bg-secondary/50 py-8 md:py-24">
        <Container>
          <div
            ref={heroAnimation.ref}
            className={`text-center mb-6 md:mb-12 ${animationClasses.fadeIn} ${
              heroAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <h1 className="mb-4">Sobre <span className="text-primary">Nós</span></h1>
            <p className="text-muted-foreground max-w-3xl mx-auto">
              Uma Jornada de Amor e Inovação pelos Pets
            </p>
          </div>
        </Container>
      </section>

      {/* ── Nossa História ── */}
      <section className="py-4 md:py-16">
        <Container>
          <div
            ref={historyAnimation.ref}
            className={`text-center mb-6 md:mb-12 ${animationClasses.fadeIn} ${
              historyAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <h2 className="mb-6">Nossa <span className="text-primary">História</span></h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-center">
            <div
              className={`${animationClasses.fadeIn} ${
                historyAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
              }`}
            >
              <p className="text-muted-foreground mb-6">
                Há mais de 40 anos, trocamos a agitação da capital paulista pela tranquilidade de Atibaia para realizar um sonho:
                construir nossa primeira sede própria totalmente dedicada ao bem‑estar dos animais. Em 1988 compramos
                o terreno da Rua Lucas, onde inauguramos nossa sede em 1990.
              </p>
              <p className="text-muted-foreground">
                A paixão cresceu, a família também, e em dezembro de 2011 mudamos para nosso endereço atual — a terceira clínica
                veterinária de Atibaia, projetada do zero para oferecer um centro completo de saúde, estética e comportamento pet.
              </p>
            </div>
            <div
              ref={historyImageAnimation.ref}
              className={`${animationClasses.slideUp} ${
                historyImageAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
              }`}
            >
              <div className="aspect-[4/3] md:aspect-[3/2] sm:aspect-square rounded-lg shadow-lg overflow-hidden">
                <img
                  src="https://ieotixprkfglummoobkb.supabase.co/storage/v1/object/public/websitecontent//Inauguration%20Clinic.jpg"
                  alt="Nossa primeira clínica em 1990 - Inauguração da sede própria da Vettale"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                />
              </div>
              <p className="text-sm text-center mt-2 text-muted-foreground">Nossa primeira sede própria inaugurada em 1990</p>
            </div>
          </div>
        </Container>
      </section>

      {/* ── Conheça os Nossos Fundadores ── */}
      <section className="bg-primary/5 py-8 md:py-16">
        <Container>
          <div
            ref={foundersAnimation.ref}
            className={`text-center mb-6 md:mb-12 ${animationClasses.fadeIn} ${
              foundersAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <h2>Conheça os Nossos <span className="text-primary">Fundadores</span></h2>
          </div>

          <div
            ref={foundersContentAnim.ref}
            className={`grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center ${animationClasses.fadeIn} ${
              foundersContentAnim.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <div>
              <p className="text-muted-foreground mb-4">
                Dr. Neto e Dra. Josane são os visionários que, há mais de 40 anos, deixaram a capital paulista para
                plantar em Atibaia uma semente de amor pelos animais.
              </p>
              <p className="text-muted-foreground mb-4">
                Com coragem, dedicação e um propósito claro, construíram do zero a primeira clínica veterinária completa
                da cidade — o que hoje é a Vettale. Médicos veterinários de alma, eles acreditavam que cuidar de pets
                era, acima de tudo, cuidar de famílias.
              </p>
              <p className="text-muted-foreground">
                Mais do que fundadores, são os guardiões de um legado que transforma vidas — uma patinha de cada vez.
              </p>
            </div>

            <YouTubeEmbed
              videoId="coznk_pphR8"
              title="História do Dr. Neto — fundador da Vettale"
            />
          </div>
        </Container>
      </section>

      {/* ── Pioneiros que Fazem História ── */}
      <section className="bg-secondary/30 py-8 md:py-16">
        <Container>
          {/* Section title */}
          <div
            ref={valuesAnimation.ref}
            className={`text-center mb-8 md:mb-12 ${animationClasses.fadeIn} ${
              valuesAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <h2>Pioneiros que <span className="text-primary">Fazem História</span></h2>
          </div>

          {/* Featured: Primeiro TaxiDog */}
          <div
            ref={taxidogAnimation.ref}
            className={`grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center mb-12 md:mb-16 ${animationClasses.slideUp} ${
              taxidogAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
            }`}
          >
            <div className="flex gap-5 items-start">
              <div className="flex-shrink-0 mt-1">
                <Dog className="h-8 w-8 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-3">Primeiro TaxiDog da cidade</h3>
                <p className="text-muted-foreground">
                  Quando ninguém falava em transporte pet, já levávamos cães e gatos com segurança — de Fusca,
                  depois de Fiorino. Uma iniciativa pioneira que colocou Atibaia no mapa do bem‑estar animal
                  e abriu portas para todo um segmento do mercado pet que hoje conhecemos.
                </p>
              </div>
            </div>

            <YouTubeEmbed
              videoId="4DfpGTOK1Dk"
              title="TaxiDog — o primeiro transporte pet pioneiro de Atibaia"
            />
          </div>

          {/* Grid of 4 achievements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12 md:mb-16">
            <div
              className={`flex gap-6 ${animationClasses.slideUp} ${
                valuesAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
              }`}
            >
              <div className="flex-shrink-0 mt-1">
                <Cat className="h-8 w-8 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Educação e Comunidade</h3>
                <p className="text-muted-foreground">
                  Feiras de adoção, ações em escolas e eventos temáticos aproximaram milhares de crianças do
                  universo pet, construindo uma cultura de respeito e cuidado com os animais em Atibaia.
                </p>
              </div>
            </div>

            <div
              className={`flex gap-6 ${animationClasses.slideInRight} ${
                valuesAnimation.isVisible ? animationClasses.slideInRightActive : animationClasses.slideInRightInactive
              }`}
            >
              <div className="flex-shrink-0 mt-1">
                <Heart className="h-8 w-8 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Serviços Premium</h3>
                <p className="text-muted-foreground">
                  De check‑ups preventivos a internações, banho & tosa com penteados elaborados e cirurgias de
                  ponta — sempre com o mesmo padrão de excelência que nos tornou referência na região.
                </p>
              </div>
            </div>

            <div
              className={`flex gap-6 ${animationClasses.slideUp} ${
                valuesAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
              }`}
            >
              <div className="flex-shrink-0 mt-1">
                <Award className="h-8 w-8 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Prêmios e Reconhecimentos</h3>
                <p className="text-muted-foreground">
                  Referência regional em excelência veterinária, com décadas de reconhecimento da comunidade
                  de Atibaia pelo atendimento humanizado e pelo espírito inovador que sempre nos guiou.
                </p>
              </div>
            </div>

            <div
              className={`flex gap-6 ${animationClasses.slideInRight} ${
                valuesAnimation.isVisible ? animationClasses.slideInRightActive : animationClasses.slideInRightInactive
              }`}
            >
              <div className="flex-shrink-0 mt-1">
                <Syringe className="h-8 w-8 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Medicina Integrativa</h3>
                <p className="text-muted-foreground">
                  De acupuntura a homeopatia, oferecemos especialidades cuidadosamente selecionadas para
                  complementar o tratamento convencional e proporcionar qualidade de vida plena ao seu pet.
                </p>
              </div>
            </div>
          </div>

        </Container>
      </section>

      {/* ── Cãominhada ── */}
      <section className="py-8 md:py-16">
        <Container>
          <div
            ref={caominhadaAnimation.ref}
            className={`${animationClasses.fadeIn} ${
              caominhadaAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <div className="text-center mb-8 md:mb-12">
              <h2><span className="text-primary">Cãominhada</span></h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mt-4">
                Trouxemos grandes patrocinadores, parceria com Purina Agility e transformamos finais de semana
                em programas para toda a família — eventos que ficaram na memória de gerações de tutores em Atibaia.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <div>
                <div className="aspect-[4/3] rounded-lg shadow-lg overflow-hidden">
                  <img
                    src="https://ieotixprkfglummoobkb.supabase.co/storage/v1/object/public/websitecontent//Dog%20Minhada%20com%20pessoas.jpg"
                    alt="Eventos da Cãominhada - Comunidade unida em prol dos pets"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-sm text-center mt-2 text-muted-foreground">
                  Nossa 2ª Cãominhada (1995): um encontro inesquecível que uniu famílias e arrecadou fundos para cães em situação de risco 🐶
                </p>
              </div>

              <YouTubeEmbed
                videoId="1y2SBlLM9ic"
                title="Cãominhada — eventos caninos da Vettale"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ── O Que Nos Move ── */}
      <section className="py-16 md:py-24">
        <Container>
          <div
            ref={teamAnimation.ref}
            className={`text-center mb-12 ${animationClasses.fadeIn} ${
              teamAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <h2>O Que Nos <span className="text-brand-primary">Move</span></h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div
              className={`bg-white p-8 rounded-lg shadow ${animationClasses.slideUp} ${
                teamAnimation.isVisible ? animationClasses.slideUpActive : teamAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
              }`}
            >
              <h3 className="text-xl font-bold mb-4 text-center text-primary">Cuidado nos detalhes</h3>
              <p className="text-muted-foreground">
                Do primeiro atendimento ao banho & tosa com penteados elaborados, sua tranquilidade é a nossa prioridade.
              </p>
            </div>

            <div
              className={`bg-white p-8 rounded-lg shadow ${animationClasses.slideInRight} ${
                teamAnimation.isVisible ? animationClasses.slideInRightActive : animationClasses.slideInRightInactive
              }`}
            >
              <h3 className="text-xl font-bold mb-4 text-center text-primary">Customer Success animal</h3>
              <p className="text-muted-foreground">
                Acompanhamos cada etapa da jornada de saúde do pet para garantir resultados duradouros.
              </p>
            </div>

            <div
              className={`bg-white p-8 rounded-lg shadow ${animationClasses.slideUp} ${
                teamAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
              }`}
            >
              <h3 className="text-xl font-bold mb-4 text-center text-primary">Segurança em primeiro lugar</h3>
              <p className="text-muted-foreground">
                Infraestrutura, protocolos rigorosos e profissionais experientes asseguram tratamentos de ponta com total confiança.
              </p>
            </div>

            <div
              className={`bg-white p-8 rounded-lg shadow ${animationClasses.slideInRight} ${
                teamAnimation.isVisible ? animationClasses.slideInRightActive : animationClasses.slideInRightInactive
              }`}
            >
              <h3 className="text-xl font-bold mb-4 text-center text-primary">Formamos profissionais</h3>
              <p className="text-muted-foreground">
                Muitos talentos que começaram conosco abriram seus próprios negócios, impulsionando o mercado pet local.
              </p>
            </div>
          </div>

          <div
            ref={teamImageAnimation.ref}
            className={`mt-12 ${animationClasses.slideUp} ${
              teamImageAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
            }`}
          >
            <div className="aspect-[4/3] md:aspect-[3/2] sm:aspect-square rounded-lg shadow-lg overflow-hidden">
              <img
                src="/render-externo.png"
                alt="Projeto da nova área externa Vettale - Espaço de lazer para pets"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
            <p className="text-sm text-center mt-2 text-muted-foreground italic">* Reforma em andamento — previsão de conclusão: outubro de 2026</p>
          </div>
        </Container>
      </section>

      {/* ── Onde Estamos Hoje ── */}
      <section className="py-16 md:py-24" style={{ backgroundColor: '#FFFCF8' }}>
        <Container>
          <div
            ref={todayAnimation.ref}
            className={`text-center mb-12 ${animationClasses.fadeIn} ${
              todayAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <h2 className="mb-4">Onde Estamos <span className="text-brand-primary">Hoje</span></h2>
            <p className="text-muted-foreground max-w-3xl mx-auto">
              De 1981 até o momento, 44 anos de dedicação em Atibaia nos transformaram de uma pequena clínica para um centro veterinário completo.
              Hoje, com tecnologia de ponta e o mesmo carinho de sempre, continuamos a missão dos fundadores.
            </p>
          </div>

          {/* Era timeline images */}
          <div
            ref={todayImagesAnimation.ref}
            className={`grid grid-cols-1 md:grid-cols-3 gap-8 mb-12 ${animationClasses.slideUp} ${
              todayImagesAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
            }`}
          >
            <div className="space-y-4">
              <div className="aspect-[4/3] md:aspect-[3/2] sm:aspect-square rounded-lg shadow-lg overflow-hidden">
                <img
                  src="https://ieotixprkfglummoobkb.supabase.co/storage/v1/object/public/websitecontent//Classic.jpg"
                  alt="Pioneiros em Atibaia-SP - Primeiros anos da clínica"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-top transition-transform duration-500 hover:scale-105"
                />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-2">Pioneiros em Atibaia-SP</h3>
                <p className="text-sm text-muted-foreground">
                  Os primeiros passos na cidade, estabelecendo as bases do que se tornaria a primeira clínica veterinária completa de Atibaia.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="aspect-[4/3] md:aspect-[3/2] sm:aspect-square rounded-lg shadow-lg overflow-hidden">
                <img
                  src="https://ieotixprkfglummoobkb.supabase.co/storage/v1/object/public/websitecontent//MundiauMed.png"
                  alt="Era MundiauPet - Três décadas de tradição veterinária"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-2">Era MundiauPet</h3>
                <p className="text-sm text-muted-foreground">
                  Três décadas de dedicação, estabelecendo a confiança da comunidade e construindo nossa reputação de excelência em Atibaia.
                </p>
              </div>
            </div>

            <div className="space-y-4 blur-sm">
              <div className="aspect-[4/3] md:aspect-[3/2] sm:aspect-square rounded-lg shadow-lg overflow-hidden">
                <img
                  src="https://ieotixprkfglummoobkb.supabase.co/storage/v1/object/public/websitecontent//NewClinic.png"
                  alt="Nova Era Vettale - Tecnologia de ponta e tradição"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-2">Era Vettale</h3>
                <p className="text-sm text-muted-foreground">
                  Nova identidade, tecnologia avançada e compromisso renovado com a excelência em cuidados veterinários.
                </p>
              </div>
            </div>
          </div>

          {/* Métricas */}
          <div
            ref={metricsAnimation.ref}
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 ${animationClasses.slideUp} ${
              metricsAnimation.isVisible ? animationClasses.slideUpActive : animationClasses.slideUpInactive
            }`}
          >
            <div className="bg-white p-6 rounded-lg shadow text-center group hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden">
              <div className="text-3xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform duration-300">+250.000</div>
              <h3 className="font-semibold text-lg mb-2">Banhos</h3>
              <p className="text-sm text-muted-foreground">Pets felizes e cheirosos que passaram por nossas mãos</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow text-center group hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden">
              <div className="text-3xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform duration-300">+16.000</div>
              <h3 className="font-semibold text-lg mb-2">Consultas</h3>
              <p className="text-sm text-muted-foreground">Consultas e cuidados especializados para cada pet</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow text-center group hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden">
              <div className="text-3xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform duration-300">+600</div>
              <h3 className="font-semibold text-lg mb-2">Cirurgias</h3>
              <p className="text-sm text-muted-foreground">Procedimentos cirúrgicos realizados com excelência</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow text-center group hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden">
              <div className="text-3xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform duration-300">∞</div>
              <h3 className="font-semibold text-lg mb-2">Sorrisos Incontáveis</h3>
              <p className="text-sm text-muted-foreground">Momentos de alegria e gratidão que não podem ser medidos</p>
            </div>
          </div>

          {/* Closing video — Legado e Futuro */}
          <div
            ref={closingVideoAnimation.ref}
            className={`${animationClasses.fadeIn} ${
              closingVideoAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold mb-2">Legado e <span className="text-brand-primary">Futuro</span></h3>
            </div>

            <YouTubeEmbed
              videoId="ZhbggWYTczk"
              title="Legado e Futuro — Dra. Josane e Dr. Neto falam sobre a Vettale"
              className="max-w-3xl mx-auto"
            />
          </div>
        </Container>
      </section>

      {/* ── CTA ── */}
      <section className="bg-brand-primary text-brand-primaryFg py-16 md:py-24">
        <Container>
          <div
            ref={ctaAnimation.ref}
            className={`text-center ${animationClasses.fadeIn} ${
              ctaAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
            }`}
          >
            <h2 className="mb-6">Agende a sua visita</h2>
            <p className="text-brand-primaryFg/90 max-w-2xl mx-auto mb-8">
              Venha conhecer o Centro Veterinário Completo mais tradicional de Atibaia. Estamos prontos para cuidar do seu pet —
              com a experiência de quem entende e o carinho de quem ama.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/book">
                <Button size="lg" variant="secondary">Agendar Consulta</Button>
              </Link>
              <Link to="/services">
                <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/20">
                  Conhecer Serviços
                </Button>
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </Layout>
  );
};

export default About;
