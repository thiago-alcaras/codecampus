# CodeCampus Oficina · Design system v1.0

Oficina é a identidade visual do CodeCampus: caderno de laboratório, ferramentas e sinalização. A interface deve transmitir curiosidade e trabalho em equipe, respeitando crianças, adolescentes e professores. Linguagem direta, composição editorial, contornos claros e conteúdo legível. Não usar gradientes decorativos, vidro translúcido, emojis como identidade ou ilustrações genéricas de janelas flutuantes.

## Fonte de verdade

- `apps/web/tokens.css`: cores semânticas, tipografia, espaços, raios, sombras e duração de movimento.
- `apps/web/styles.css`: estrutura e layout dos componentes existentes.
- `apps/web/workshop.css`: identidade Oficina, estados, acessibilidade e adaptações responsivas.
- `apps/web/certificate.css`: documento de conclusão com os mesmos tokens.
- `apps/web/design-system.html`: galeria funcional com componentes reais, formulários, abas, diálogo e estados. Com a API rodando, abra `/static/design-system.html`.

Ambas as folhas da interface devem ser carregadas nesta ordem: `styles.css`, `workshop.css`. A galeria acrescenta apenas estilos de apresentação; não substitui componentes do campus.

## Paleta

| Token | Cor | Uso |
|---|---|---|
| `--paper` | `#F4F1E9` | Fundo principal |
| `--surface` | `#FFFCF5` | Conteúdo e campos |
| `--surface-soft` | `#ECE8DE` | Agrupamento e leitura de roteiros |
| `--ink` | `#202D2A` | Texto principal, navegação e trilha final |
| `--muted` | `#59645E` | Apoio legível |
| `--action` | `#235443` | Ações principais e conclusão |
| `--accent` | `#B43E22` | Ênfase editorial |
| `--highlight` | `#E6BB4F` | Marcador com texto escuro |
| `--info` | `#284F76` | Informação e foco |
| `--warning` | `#795411` | Atenção com fundo `--warning-soft` |
| `--danger` | `#A12D2D` | Falhas e ações destrutivas |

Texto claro só sobre tinta, verde, azul ou vermelho escuros. Sobre amarelo, usar tinta escura. `--line` é divisor decorativo; campos usam `--control-border`. Estado deve ter texto ou ícone, além da cor. “Entregue”, “Concluído” e “Fora do prazo” precisam continuar escritos.

## Tipografia e ritmo

Space Grotesk 500–600 para títulos e marca; Source Sans 3 400–600 para leitura e controles; IBM Plex Mono 400 para números, código e etiquetas. Fontes hospedadas localmente com `font-display: swap`, sem requisições a serviços de fontes. Binários originais e respectivas licenças SIL OFL estão em `apps/web/fonts/`.

Fontes oficiais: [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk), [Source Sans 3](https://github.com/google/fonts/tree/main/ofl/sourcesans3), [IBM Plex Mono](https://github.com/google/fonts/tree/main/ofl/ibmplexmono).

Texto de leitura 16 px, corpo de cards 14–15 px, apoio 13–14 px. Etiquetas técnicas podem ter 10–12 px e não carregam instruções essenciais. Títulos de página 28–38 px; apresentação de login 36–68 px. Linhas de leitura entre 1,5 e 1,8. Títulos curtos, peso 500 ou 600, sem caixa alta em frases longas.

Escala de espaços: 4, 8, 12, 16, 24, 32, 48 e 64 px. Raios: 3 px para controles; 6 px para blocos; 10 px para diálogos. Evitar cantos excessivamente arredondados. Sombras curtas em cards, sombra de elevação em diálogos. Movimento 140 ou 220 ms, respeitando `prefers-reduced-motion`.

## Componentes e regras

| Componente | Regra |
|---|---|
| Marca | Símbolo de código em marcador amarelo com canto recortado; wordmark Space Grotesk |
| Navegação | Tinta escura; item ativo com faixa amarela, contraste e `aria-current` |
| Botão | Principal verde; secundário com contorno; destrutivo vermelho; estado indisponível visível |
| Campo | Rótulo persistente, contorno perceptível, foco azul, texto mínimo 16 px |
| Erro | Mensagem com próximo passo; `aria-invalid` e `aria-describedby` quando associado ao campo |
| Cards de turma | Identidade da trilha na faixa superior, dados acadêmicos abaixo |
| Módulos e aulas | Cabeçalho agrupado, número monoespaçado, conclusão escrita e ação específica |
| Prova | Alternativa selecionada com faixa e preenchimento; tempo em números monoespaçados |
| Tabela | Cabeçalhos técnicos, texto alinhado à esquerda, rolagem contida em tela estreita |
| Modal | Diálogo nativo com título, foco contido, Escape e botão de fechamento de 44 px |
| Aviso | Mensagem clara, sem depender de cor; região de status anunciada |
| Vazio | Dizer o que falta e onde a pessoa pode continuar |

Exemplos de ações: “Enviar material”, “Abrir aula”, “Entregar projeto”, “Avaliar entrega”. Evitar “OK” quando a consequência precisa ser explicada. Falhas devem explicar o próximo passo sem culpabilizar o aluno.

## Trilhas

1. **Folha / 01:** primeiras descobertas; verde claro com texto verde escuro.
2. **Planta / 02:** desenvolvimento; azul claro com texto azul escuro.
3. **Tinta / 03:** engenharia e IA; tinta escura com texto papel.
4. **Sinal / ↗:** trilhas de criação adicionais; laranja claro com texto terracota.

Os códigos de cor `mint`, `blue`, `purple` e `orange` persistidos na API foram preservados para compatibilidade. `purple` representa agora a trilha Tinta, sem alterar turmas existentes.

## Responsividade e acessibilidade

Desktop: navegação fixa e área principal, trilhas em duas ou três colunas; painel lateral de apoio. Até 900 px, apoio passa abaixo e métricas usam duas colunas. Até 650 px, navegação recolhida, cards em uma coluna e formulários empilhados. Alvos primários têm no mínimo 44 px de altura. Tabelas rolam dentro do próprio contêiner.

Menu móvel fecha por acionador, clique no fundo, Escape ou navegação. Foco de teclado explícito, link para pular ao conteúdo, sem depender de hover. A galeria demonstra navegação de abas por setas, Home e End. Cor nunca substitui rótulos; suporte a cores forçadas e movimento reduzido. Validação automatizada não substitui avaliação com usuários e leitores de tela.

## Estender

Ao adicionar uma tela, reutilize `heading`, `button`, `field`, `area`, `select`, `table` e `formDialog` da aplicação. Use tokens semânticos; não introduza paletas específicas por página. Monte primeiro hierarquia, conteúdo e ações; aplique a identidade em seguida. Preserve as regras de autorização da API.

Publicação da galeria e das capturas usa somente dados fictícios. Conteúdos enviados por professores, arquivos privados e segredos ficam fora do repositório.
