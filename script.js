import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// IMPORTAÇÃO DOS DADOS DO ARQUIVO data.js
// Certifique-se de que seu arquivo data.js está na mesma pasta que script.js
// e que a variável 'allCollaboratorsData' é exportada usando 'export const'.
import { allCollaboratorsData } from './data.js';

// --- Mapeamento de Cores para Tipos de Carteirinha ---
// Defina as cores hexadecimais para cada tipo de carteirinha que pode vir da coluna "Type" (F) do seu Excel.
const cardTypeColors = {
    "TECHNICAL (TC)": '#FFFFFF', // Branco puro
    "TRAINER (T)": '#004d99',    // Azul Yazaki
    "TRAINER'S TRAINER (TT)": '#FFD700', // Dourado (Gold)
    "DEFAULT": '#808080' // Cor padrão para tipos não definidos (cinza)
};

// --- Processamento dos Dados Importados do Excel (data.js) ---
// Esta seção organiza os dados brutos de 'allCollaboratorsData' em uma estrutura
// mais fácil de usar para o mapa (agrupado por localização) e para exibir as listas de colaboradores.
const locationsData = {};

// Mapeamento de localizações (da coluna "Local" do seu Excel) para coordenadas geográficas.
// É CRUCIAL que você adicione aqui as coordenadas de LATITUDE e LONGITUDE
// para TODAS AS CIDADES/PLANTAS que você terá na coluna "Local" do seu Excel.
// Se uma localização no seu Excel não estiver definida aqui, o marcador no mapa
// será posicionado no centro do Brasil (fallback).
// Para um sistema em produção, essas coordenadas viriam de um banco de dados
// ou seriam obtidas via um serviço de geocodificação de endereços.
const predefinedCoordinates = {
    "Tatuí, SP, Brasil": [-23.3519, -47.8461], // Coordenadas atualizadas
    "Bonito, PE, Brasil": [-8.47163, -35.7292], // Coordenadas atualizadas
    "Escobar, CT, Argentina": [-34.34667, -58.81861], // Coordenadas atualizadas
    "Matozinhos, MG, Brasil": [-19.5543, -44.0868], // Coordenadas atualizadas
    "Irati, PR, Brasil": [-25.470032, -50.659013], // Coordenadas atualizadas
    // ADICIONE MAIS PLANTAS/CIDADES AQUI COM SUAS COORDENADAS REAIS
    "DEFAULT": [-15.7801, -47.9292] // Coordenadas padrão para locais não definidos
};

// Itera sobre cada linha (objeto) de colaborador importada do Excel
allCollaboratorsData.forEach(excelRow => {
    // Obtém o nome da localização a partir da coluna "Local" do Excel
    const locationName = excelRow["Local"];

    // Validação: Garante que a coluna "Local" não está vazia. Se estiver, um aviso é emitido e a linha é pulada.
    if (!locationName) {
        console.warn("Linha do Excel sem 'Local' definido, pulando registro:", excelRow);
        return;
    }

    // Se esta localização ainda não foi adicionada ao objeto locationsData, a inicializa.
    if (!locationsData[locationName]) {
        // Tenta encontrar as coordenadas pré-definidas para a localização,
        // ou usa um ponto no centro do Brasil como fallback.
        const coordinates = predefinedCoordinates[locationName] || predefinedCoordinates["DEFAULT"]; 
        locationsData[locationName] = {
            coordinates: coordinates,
            collaborators: [] // Inicializa um array vazio para armazenar os colaboradores desta localização
        };
    }

    // Processa a string de "Process Codes" (coluna "G" do Excel) para um objeto de fácil acesso.
    // Ex: "BL-A, EC-M" se torna { "BL-A": true, "EC-M": true }.
    const processCodesString = excelRow["Process"] || ""; // Obtém a string de códigos (ou vazio se não houver)
    const codes = {}; // Objeto para armazenar os códigos processados
    if (processCodesString) {
        processCodesString.split(',').forEach(code => {
            codes[code.trim()] = true; // Remove espaços em branco e marca o código como presente
        });
    }

    // Adiciona o objeto do colaborador processado ao array da sua respectiva localização.
    locationsData[locationName].collaborators.push({
        id: excelRow["Issue number"], // Usado como identificador único para o colaborador
        name: excelRow["Name"],
        expDate: excelRow["Expiration date"],
        company: excelRow["Certified Company"],
        dept: excelRow["Certified Dept"],
        issue: excelRow["Issue number"],
        type: excelRow["Type"], // Valor da coluna "Type" (F)
        photo: excelRow["Imagem"], // Nome do arquivo da imagem de perfil (ex: "profile.jpg")
        codes: codes, // Objeto com o status de cada Process Code
        processCodeDefinition: excelRow["Process Code Definition"] // Definição completa dos códigos (coluna H)
    });
});
// FIM DO PROCESSAMENTO DE DADOS

// --- Elementos do DOM (Document Object Model) ---
// Referências aos elementos HTML da página, permitindo manipulação via JavaScript.
const mapSection = document.getElementById('map-section'); // Seção do mapa
const collaboratorListSection = document.getElementById('collaborator-list-section'); // Seção da lista de colaboradores
const cardViewerSection = document.getElementById('card-viewer-section'); // Seção da visualização da carteirinha
const selectedLocationName = document.getElementById('selected-location-name'); // Span para o nome da localização selecionada
const collaboratorList = document.getElementById('collaborator-list'); // Lista <ul> para colaboradores
const backToMapBtn = document.getElementById('back-to-map'); // Botão "Voltar ao Mapa"
const cardHolderName = document.getElementById('card-holder-name'); // Span para o nome na carteirinha
const card3dContainer = document.getElementById('card-3d-container'); // Div que hospeda o canvas 3D
const backToListBtn = document.getElementById('back-to-list'); // Botão "Voltar à Lista"

// --- Variáveis Leaflet (para o Mapa) ---
let map; // Objeto mapa do Leaflet

// --- Variáveis Three.js (para a Carteirinha 3D) ---
let scene, camera, renderer, controls, cardMesh; // Componentes fundamentais da cena 3D
// Proporções e dimensões da carteirinha no ambiente 3D e para geração de textura.
const CARD_WIDTH_RATIO = 1.6; // Proporção de aspecto típica de um cartão (largura / altura)
const CARD_RENDER_HEIGHT = 760; // Altura em pixels da textura 2D que será aplicada na carteirinha 3D (impacta a nitidez)
const CARD_RENDER_WIDTH = CARD_RENDER_HEIGHT * CARD_WIDTH_RATIO; // Largura em pixels, calculada para manter a proporção
const CARD_3D_DISPLAY_HEIGHT = 4; // Altura da carteirinha no ambiente 3D (em unidades do Three.js)
const CARD_3D_DISPLAY_WIDTH = CARD_3D_DISPLAY_HEIGHT * CARD_WIDTH_RATIO; // Largura 3D, calculada para manter a proporção
const CARD_DEPTH = 0.05; // Espessura da carteirinha no ambiente 3D (fininha)

// Loader de texturas do Three.js para carregar imagens externas (logo e foto de perfil)
const textureLoader = new THREE.TextureLoader();

// Variáveis para controlar o zoom da câmera 3D com o scroll do mouse
const MIN_ZOOM = 5; // Posição Z da câmera mais distante (zoom out máximo)
const MAX_ZOOM = 3; // Posição Z da câmera mais próxima (zoom in máximo)
const ZOOM_SPEED = 0.1; // Sensibilidade do scroll do mouse para o zoom (ajuste este valor se o zoom estiver muito rápido/lento)

// --- Funções de Navegação entre as Seções do Site ---
function showSection(sectionId) {
    // Oculta todas as seções primeiro, para garantir que apenas uma esteja visível por vez.
    mapSection.style.display = 'none';
    collaboratorListSection.style.display = 'none';
    cardViewerSection.style.display = 'none';
    // Exibe apenas a seção HTML cujo ID foi passado como argumento.
    document.getElementById(sectionId).style.display = 'block';

    // Se a seção do mapa for re-exibida, é crucial invalidar o tamanho do Leaflet.
    // Isso força o mapa a se redesenhar corretamente, evitando problemas de visualização
    // caso ele estivesse oculto e o contêiner HTML tenha tido seu tamanho alterado.
    if (sectionId === 'map-section' && map) {
        map.invalidateSize();
    } else if (sectionId === 'card-viewer-section' && renderer) { // Adicionada esta condição
        // Força o Three.js a atualizar seu tamanho após o contêiner se tornar visível
        onWindowResize();
    }
}

// --- Funções para Exibição da Lista de Colaboradores ---
function showCollaborators(locationName) {
    selectedLocationName.textContent = locationName; // Atualiza o título da seção com o nome da localização.
    collaboratorList.innerHTML = ''; // Limpa qualquer colaborador da lista anterior.

    const locationData = locationsData[locationName]; // Obtém os dados específicos para a localização selecionada.
    if (locationData && locationData.collaborators.length > 0) {
        // Se existirem colaboradores para esta localização, cria um item de lista para cada um.
        locationData.collaborators.forEach(col => {
            const li = document.createElement('li');
            li.textContent = col.name; // Define o texto do item da lista como o nome do colaborador.
            li.dataset.id = col.id; // Armazena o ID do colaborador (pode ser útil para futuras funcionalidades).
            // Adiciona um evento de clique: ao clicar no nome do colaborador, exibe a carteirinha 3D dele.
            li.addEventListener('click', () => showCard(col));
            collaboratorList.appendChild(li); // Adiciona o item à lista HTML.
        });
    } else {
        // Se não houver colaboradores para a localização, exibe uma mensagem informativa.
        collaboratorList.innerHTML = '<li>Nenhum colaborador encontrado para esta unidade.</li>';
    }
    showSection('collaborator-list-section'); // Exibe a seção da lista de colaboradores.
}

// --- Funções de Inicialização do Mapa Leaflet ---
function initMap() {
    // Inicializa o mapa Leaflet no elemento HTML com ID 'leaflet-map'.
    // Define a visualização inicial centralizada na América do Sul com um nível de zoom (5).
    map = L.map('leaflet-map').setView([-18, -55], 5); // Centralizado na América do Sul, zoom 5 para visibilidade de marcadores

    // Adiciona uma camada de tiles (blocos de imagem do mapa) do OpenStreetMap.
    // Esta é a base visual do seu mapa.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { // Revertido para o tema padrão do OpenStreetMap
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>' // Atribuição original
    }).addTo(map);

    // Cria um ícone personalizado usando a imagem Localização.png
    const customIcon = L.icon({
        iconUrl: 'Localização.png', // Caminho para sua imagem de pin
        iconSize: [52, 32],        // Tamanho do ícone (largura, altura) em pixels. Ajuste conforme necessário.
        iconAnchor: [19, 38],      // Ponto do ícone que corresponde à localização do marcador (geralmente o "bico" do pin)
        popupAnchor: [0, -30]     // Ponto onde o popup deve abrir em relação ao ícone
    });

    // Itera sobre cada localização processada (que veio do seu Excel via data.js)
    // para adicionar um marcador no mapa.
    for (const locationName in locationsData) {
        const location = locationsData[locationName];
        if (location && location.coordinates) {
            // Usa o ícone personalizado ao criar o marcador
            const marker = L.marker(location.coordinates, { icon: customIcon }).addTo(map);
            
            // --- Conteúdo dinâmico do popup (o "visor") ---
            let popupContentHtml = `<div style="color: #333;"><b>${locationName}</b><br><hr style="border-top: 1px solid #ccc; margin: 5px 0;">`; // Adiciona cor para o texto do popup e estilo para o hr
            const collaboratorsForPopup = location.collaborators;

            if (collaboratorsForPopup.length > 0) {
                popupContentHtml += `<div style="max-height: 150px; overflow-y: auto; margin-bottom: 5px;">`; 
                collaboratorsForPopup.forEach(col => {
                    popupContentHtml += `<p style="margin: 5px 0;"><b>${col.name}</b><br>`; 
                    const activeCodes = Object.keys(col.codes).filter(code => col.codes[code]);
                    if (activeCodes.length > 0) {
                        popupContentHtml += `Processos: ${activeCodes.join(', ')}`; // Alterado "Códigos:" para "Processos:"
                    } else {
                        popupContentHtml += `Nenhum processo treinado.`; // Texto ajustado para consistência
                    }
                    popupContentHtml += `</p>`;
                });
                popupContentHtml += `</div>`;
                // Botão para ver a lista completa de colaboradores
                popupContentHtml += `<button class="view-full-list-btn" data-location-name="${locationName}">VER LISTA COMPLETA</button>`; 
            } else {
                popupContentHtml += `<p>Nenhum colaborador encontrado para esta unidade.</p>`;
            }
            popupContentHtml += `</div>`; // Fecha a div de conteúdo principal do popup

            marker.bindPopup(popupContentHtml);

            // Adiciona listener para o evento 'popupopen' do marcador
            marker.on('popupopen', function() {
                const popupElement = this.getPopup().getElement();
                const button = popupElement.querySelector('.view-full-list-btn');
                if (button) {
                    button.addEventListener('click', () => {
                        const locName = button.getAttribute('data-location-name');
                        showCollaborators(locName);
                        map.closePopup(); // Fecha o popup ao clicar no botão
                    });
                }
            });

            // Remove o antigo marker.on('click') que abria diretamente a lista de colaboradores,
            // pois agora o popup serve como intermediário.
            // marker.on('click', () => { showCollaborators(locationName); });
        }
    }
}

// --- Funções da Carteirinha 3D (Three.js) ---

// Inicializa a cena 3D, configurando o ambiente para renderizar objetos 3D.
function init3DScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0); // Define a cor de fundo da cena 3D (cinza claro).

    // Configura a câmera de perspectiva (como um olho humano vê o mundo).
    camera = new THREE.PerspectiveCamera(75, card3dContainer.clientWidth / card3dContainer.clientHeight, 0.1, 1000);
    camera.position.z = MIN_ZOOM; // Define a posição inicial da câmera em Z para o zoom out máximo.

    // Configura o renderizador WebGL, que desenha os gráficos 3D no canvas HTML.
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // antialias suaviza bordas, alpha:true permite fundo transparente.
    renderer.setPixelRatio(window.devicePixelRatio); // Ajusta a resolução para telas de alta densidade (retina).
    renderer.setSize(card3dContainer.clientWidth, card3dContainer.clientHeight); // Define o tamanho do renderizador para o tamanho do contêiner HTML.
    card3dContainer.appendChild(renderer.domElement); // Adiciona o canvas (onde o 3D é desenhado) ao elemento HTML.

    // Adiciona luzes à cena para que os objetos 3D sejam visíveis e tenham volume.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Luz ambiente (ilumina uniformemente todos os objetos).
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6); // Luz direcional (simula uma fonte de luz, como o sol, vindo de uma direção específica).
    directionalLight.position.set(5, 5, 5).normalize(); // Define a posição da luz.
    scene.add(directionalLight);

    // Configura os controles de órbita, permitindo ao usuário rotacionar o objeto 3D com o mouse.
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false; // Desabilitamos o zoom padrão dos controles, pois o faremos manualmente via scroll.
    controls.enablePan = false; // Desabilita o arrastar da câmera.
    controls.maxPolarAngle = Math.PI / 2; // Limita a rotação vertical para que a carteirinha não vire de cabeça para baixo.

    // Adiciona um listener para o evento de scroll do mouse no contêiner 3D, para controlar o zoom.
    card3dContainer.addEventListener('wheel', onMouseWheel, { passive: false }); // { passive: false } permite usar event.preventDefault().

    // Loop de animação: Esta função é chamada repetidamente para renderizar a cena continuamente.
    function animate() {
        requestAnimationFrame(animate); // Solicita que o navegador chame 'animate' novamente no próximo frame.
        controls.update(); // Atualiza os controles de órbita (necessário para rotação suave).
        renderer.render(scene, camera); // Renderiza a cena atual a partir da perspectiva da câmera.
    }
    animate(); // Inicia o loop de animação.

    // Adiciona um listener para o evento de redimensionamento da janela do navegador,
    // para que a cena 3D se ajuste ao novo tamanho da tela.
    window.addEventListener('resize', onWindowResize);
}

// Função chamada quando a janela do navegador é redimensionada.
function onWindowResize() {
    // Ajusta o aspecto da câmera para corresponder às novas proporções do contêiner 3D.
    camera.aspect = card3dContainer.clientWidth / card3dContainer.clientHeight;
    camera.updateProjectionMatrix(); // Atualiza a matriz de projeção da câmera para refletir o novo aspecto.
    // Ajusta o tamanho do renderizador para preencher o contêiner 3D.
    renderer.setSize(card3dContainer.clientWidth, card3dContainer.clientHeight);
}

// Função para controlar o zoom da câmera 3D com o scroll do mouse.
function onMouseWheel(event) {
    event.preventDefault(); // Impede o comportamento padrão do scroll da página (ex: rolar a tela).

    // Calcula a nova posição Z da câmera com base na direção do scroll (event.deltaY).
    // O fator 0.01 ajusta a sensibilidade do zoom.
    let newZ = camera.position.z + event.deltaY * ZOOM_SPEED * 0.01; 
    // Limita a nova posição Z entre o zoom mais próximo (MAX_ZOOM) e o mais distante (MIN_ZOOM).
    newZ = Math.max(MAX_ZOOM, Math.min(MIN_ZOOM, newZ)); 
    camera.position.z = newZ; // Aplica a nova posição Z à câmera.
}

// Função crucial: Desenha o conteúdo da carteirinha (texto, imagens, formas) diretamente em um Canvas HTML.
// Este canvas é então transformado em uma textura que será aplicada ao modelo 3D da carteirinha.
async function drawCardToCanvas(cardData, isFront, textureWidth, textureHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = textureWidth; // Define a largura do canvas de textura
    canvas.height = textureHeight; // Define a altura do canvas de textura
    const ctx = canvas.getContext('2d'); // Obtém o contexto 2D para desenhar no canvas

    // Fundo da carteirinha: Cores diferentes para frente e verso.
    ctx.fillStyle = isFront ? '#f0f0f0' : '#e0e0e0';
    ctx.fillRect(0, 0, textureWidth, textureHeight);

    // Borda sutil interna (cinza claro)
    ctx.strokeStyle = '#cccccc'; // Cor cinza clara
    ctx.lineWidth = 2; // Espessura fina para a borda
    ctx.strokeRect(1, 1, textureWidth - 2, textureHeight - 2); // Desenha a borda um pixel para dentro

    // Borda externa da carteirinha (cor azul Yazaki)
    ctx.strokeStyle = '#004d99'; 
    ctx.lineWidth = 24; // Espessura da borda
    // Desenha a borda fora dos limites do canvas para que ela 'envolva' o cartão 3D
    ctx.strokeRect(-ctx.lineWidth, -ctx.lineWidth, textureWidth + ctx.lineWidth * 2, textureHeight + ctx.lineWidth * 2);

    ctx.fillStyle = '#333'; // Cor padrão para o texto principal (cinza escuro)
    ctx.textAlign = 'left'; // Alinhamento padrão do texto à esquerda

    // --- Barra Lateral Dinâmica (agora presente tanto na frente quanto no verso) ---
    // Determina a cor da barra lateral com base no 'type' do colaborador,
    // usando o mapeamento 'cardTypeColors' ou a cor 'DEFAULT'.
    const sidebarColor = cardTypeColors[cardData.type] || cardTypeColors["DEFAULT"]; 
    ctx.fillStyle = sidebarColor; // Define a cor de preenchimento da barra
    const sidebarWidth = textureWidth * 0.1; // Largura da barra lateral (10% da largura total da textura)
    ctx.fillRect(0, 0, sidebarWidth, textureHeight); // Desenha a barra lateral retangular.

    // Desenha o texto do 'Type' (ex: "TECHNICAL (TC)") verticalmente dentro da barra lateral.
    ctx.save(); // Salva o estado atual do contexto do canvas (importante antes de transformações como translate/rotate).
    ctx.translate(sidebarWidth / 2, textureHeight / 2); // Move o ponto de origem para o centro da barra lateral.
    ctx.rotate(-Math.PI / 2); // Gira o canvas 90 graus no sentido anti-horário para texto vertical.
    ctx.font = 'bold ' + (textureHeight * 0.06) + 'px Arial'; // Define a fonte e tamanho do texto.
    // Ajusta a cor do texto na barra lateral para garantir contraste: preto se a barra for branca, senão branco.
    ctx.fillStyle = (sidebarColor === '#FFFFFF') ? '#333' : 'white'; 
    ctx.textAlign = 'center'; // Centraliza o texto dentro da área de desenho girada.
    ctx.fillText(cardData.type || 'N/A', 0, 0); // Desenha o texto do tipo da carteirinha.
    ctx.restore(); // Restaura o estado anterior do contexto do canvas (desfaz a translação e rotação).

    // Defina a cor de preenchimento para o texto principal da carteirinha (detalhes do colaborador)
    // Isso é colocado aqui para garantir que o texto não herde a cor da sidebar.
    ctx.fillStyle = '#333'; 

    if (isFront) {
        // --- Conteúdo da Frente da Carteirinha ---

        // Logo Yazaki
        try {
            // Carrega a imagem do logo.
            const logoTexture = await textureLoader.loadAsync('yazaki_logo.png');
            // Desenha o logo no canvas, ajustando sua posição para começar APÓS a barra lateral
            // e mantendo sua proporção e tamanho em relação à textura total.
            ctx.drawImage(logoTexture.image, sidebarWidth + (textureWidth * 0.03), textureHeight * 0.05, textureWidth * 0.2, textureHeight * 0.1); 
        } catch (e) {
            console.error("Erro ao carregar logo:", e);
            // Fallback visual em caso de falha no carregamento do logo.
            ctx.fillStyle = 'red';
            ctx.fillRect(sidebarWidth + (textureWidth * 0.03), textureHeight * 0.05, textureWidth * 0.2, textureHeight * 0.1);
            ctx.fillStyle = 'white';
            ctx.font = 'bold ' + (textureHeight * 0.04) + 'px Arial'; 
            ctx.fillText('LOGO', sidebarWidth + (textureWidth * 0.07), textureHeight * 0.1);
        }

        // Título "Certificate" (ajusta posição para começar APÓS a barra lateral)
        ctx.font = 'bold ' + (textureHeight * 0.08) + 'px Arial'; 
        ctx.fillStyle = '#333'; // Garante que a cor seja cinza escuro
        ctx.fillText('Certificate', sidebarWidth + (textureWidth * 0.25), textureHeight * 0.1);

        // Subtítulo "YM - Technical License System"
        ctx.font = 'bold ' + (textureHeight * 0.05) + 'px Arial';
        ctx.fillStyle = '#666'; // Cor do subtítulo
        ctx.textAlign = 'right'; // Alinha o texto à direita
        
        // Divide o texto em duas linhas para a quebra de linha
        const subtitlePart1 = 'YM - Technical';
        const subtitlePart2 = 'License System';

        // Posição X ajustada para a direita, Y na altura do "Certificate"
        const subtitleX = textureWidth - (textureWidth * 0.03); 
        // Ajusta as posições Y para que as duas linhas fiquem alinhadas e separadas
        const subtitleY1 = textureHeight * 0.09; // Primeira linha
        const subtitleY2 = subtitleY1 + (textureHeight * 0.045); // Segunda linha abaixo da primeira

        ctx.fillText(subtitlePart1, subtitleX, subtitleY1);
        ctx.fillText(subtitlePart2, subtitleX, subtitleY2);

        ctx.textAlign = 'left'; // Reset para o alinhamento padrão para textos subsequentes
        ctx.fillStyle = '#333'; // Reset para a cor padrão do texto

        // Detalhes do Colaborador (informações da carteirinha - ajusta posição para começar APÓS a barra lateral)
        ctx.font = (textureHeight * 0.04) + 'px Arial'; 
        let yPos = textureHeight * 0.25;
        const xPosDetails = sidebarWidth + (textureWidth * 0.03); 

        ctx.fillText(`Expiration date: ${cardData.expDate}`, xPosDetails, yPos); yPos += textureHeight * 0.06;
        ctx.fillText(`Name: ${cardData.name}`, xPosDetails, yPos); yPos += textureHeight * 0.06;
        ctx.fillText(`Certified Company: ${cardData.company}`, xPosDetails, yPos); yPos += textureHeight * 0.06;
        ctx.fillText(`Certified Dept: ${cardData.dept}`, xPosDetails, yPos); yPos += textureHeight * 0.06;
        ctx.fillText(`Issue number: ${cardData.issue}`, xPosDetails, yPos); yPos += textureHeight * 0.06;
        ctx.fillText(`[Type] ${cardData.type}`, xPosDetails, yPos);

        // Foto de Perfil (mantém a posição no canto direito, pois a sidebar está na esquerda)
        try {
            const profileTexture = await textureLoader.loadAsync(cardData.photo); // Corrigido para usar cardData.photo
            const photoWidth = textureWidth * 0.2; 
            const photoHeight = textureHeight * 0.3; 
            ctx.drawImage(profileTexture.image, textureWidth - photoWidth - (textureWidth * 0.03), textureHeight * 0.2, photoWidth, photoHeight); 
        } catch (e) {
            console.error("Erro ao carregar foto de perfil:", e);
            ctx.fillStyle = 'gray';
            ctx.fillRect(textureWidth - (textureWidth * 0.2) - (textureWidth * 0.03), textureHeight * 0.2, textureWidth * 0.2, textureHeight * 0.3);
            ctx.fillStyle = 'white';
            ctx.font = 'bold ' + (textureHeight * 0.05) + 'px Arial'; 
            ctx.fillText('NO PHOTO', textureWidth - (textureWidth * 0.18), textureHeight * 0.35);
        }

        // Process Codes (Frente) - Simulação dos blocos de status (ajusta posição para começar APÓS a barra lateral)
        ctx.font = (textureHeight * 0.04) + 'px Arial';
        let codeYStart = textureHeight * 0.7; 
        const codeXStart = sidebarWidth + (textureWidth * 0.03); // Ajusta o X inicial
        const boxSize = textureHeight * 0.03;
        const textOffset = boxSize * 0.8; 

        // Função auxiliar para desenhar cada código de processo
        // Agora, só desenha se o 'status' for verdadeiro
        const drawCode = (code, status) => {
            if (status) { // SOMENTE desenha se o status for verdadeiro (módulo preenchido)
                ctx.fillStyle = '#333'; // Garante a cor do texto do módulo
                ctx.fillText(code, codeXStart, codeYStart);
                ctx.strokeStyle = '#666'; // Cor da borda do quadrado
                ctx.strokeRect(codeXStart + (textureWidth * 0.12), codeYStart - textOffset, boxSize, boxSize);
                ctx.fillStyle = '#00cc00'; // Cor de preenchimento do quadrado
                ctx.fillRect(codeXStart + (textureWidth * 0.12), codeYStart - textOffset, boxSize, boxSize);
            }
        };

        // Chama drawCode para os módulos, eles só aparecerão se "status" for true
        drawCode('BL-A', cardData.codes["BL-A"]); codeYStart += textureHeight * 0.06;
        drawCode('EC-M', cardData.codes["EC-M"]); codeYStart += textureHeight * 0.06;
        drawCode('EC-A', cardData.codes["EC-A"]);

    } else {
        // --- Conteúdo do Verso da Carteirinha ---
        // As posições do texto principal do verso também foram ajustadas para levar em conta a sidebar.

        // Título "Process Code Definition" (ajusta posição para não sobrepor a barra lateral)
        ctx.fillStyle = '#333';
        ctx.font = 'bold ' + (textureHeight * 0.06) + 'px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Process Code Definition', sidebarWidth + (textureWidth * 0.03), textureHeight * 0.1);

        // Definições dos códigos de processo (ajusta posição)
        ctx.font = (textureHeight * 0.04) + 'px Arial';
        let yPos = textureHeight * 0.18;
        const xPosDefinitions = sidebarWidth + (textureWidth * 0.03); 

        const definitions = cardData.processCodeDefinition ? cardData.processCodeDefinition.split(',') : [];
        definitions.forEach(def => {
            ctx.fillText(def.trim(), xPosDefinitions, yPos);
            yPos += textureHeight * 0.06;
        });
    }

    // Retorna a textura Three.js criada a partir do canvas HTML
    return new THREE.CanvasTexture(canvas);
}

// Atualiza o modelo 3D da carteirinha com os dados do colaborador selecionado
async function updateCardTexture(cardData) {
    // Gera as texturas da frente e do verso usando a função drawCardToCanvas
    const frontTexture = await drawCardToCanvas(cardData, true, CARD_RENDER_WIDTH, CARD_RENDER_HEIGHT);
    const backTexture = await drawCardToCanvas(cardData, false, CARD_RENDER_WIDTH, CARD_RENDER_HEIGHT);

    // Verifica se o modelo 3D da carteirinha (cardMesh) já existe na cena
    if (cardMesh) {
        cardMesh.geometry.dispose(); // Libera a memória da geometria antiga para evitar vazamentos
        // Atualiza a geometria do cartão 3D com as dimensões corretas (para manter a proporção)
        cardMesh.geometry = new THREE.BoxGeometry(CARD_3D_DISPLAY_WIDTH, CARD_3D_DISPLAY_HEIGHT, CARD_DEPTH);

        // Aplica as novas texturas às faces frontal e traseira do modelo 3D
        // A ordem dos materiais no BoxGeometry é importante: 4 para frente (+z), 5 para trás (-z)
        cardMesh.material[4].map = frontTexture; 
        cardMesh.material[5].map = backTexture;  
        
        // Marca que os materiais precisam ser atualizados na próxima renderização
        cardMesh.material[4].needsUpdate = true;
        cardMesh.material[5].needsUpdate = true;

    } else {
        // Se o modelo 3D da carteirinha ainda não existe, cria-o pela primeira vez
        const geometry = new THREE.BoxGeometry(CARD_3D_DISPLAY_WIDTH, CARD_3D_DISPLAY_HEIGHT, CARD_DEPTH);

        const frontMaterial = new THREE.MeshBasicMaterial({ map: frontTexture });
        const backMaterial = new THREE.MeshBasicMaterial({ map: backTexture });
        const sideMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc }); // Material para as laterais do cartão

        // Define os materiais para cada uma das 6 faces do BoxGeometry
        const materials = [
            sideMaterial, // Face +x (direita)
            sideMaterial, // Face -x (esquerda)
            sideMaterial, // Face +y (topo)
            sideMaterial, // Face -y (base)
            frontMaterial, // Face +z (frente do cartão)
            backMaterial   // Face -z (verso do cartão)
        ];

        cardMesh = new THREE.Mesh(geometry, materials); // Cria o objeto Mesh 3D com a geometria e materiais
        scene.add(cardMesh); // Adiciona o objeto 3D à cena
    }
    // Reinicia a posição e rotação do cartão para garantir que ele comece de frente e centralizado
    cardMesh.position.set(0, 0, 0);
    cardMesh.rotation.set(0, 0, 0);
    // Reinicia o zoom da câmera para a posição inicial ao trocar de carteirinha
    camera.position.z = MIN_ZOOM; 
}

// Exibe a seção da carteirinha e a popula com os dados do colaborador
function showCard(cardData) {
    cardHolderName.textContent = cardData.name; // Atualiza o nome do titular da carteirinha no título da seção.
    // Garante que a cena 3D esteja inicializada antes de tentar renderizar o cartão.
    if (!scene) {
        init3DScene();
    }
    updateCardTexture(cardData); // Atualiza o conteúdo visual da carteirinha 3D com os dados do colaborador.
    showSection('card-viewer-section'); // Exibe a seção da carteirinha 3D.
}

// --- EventListeners Globais ---
// Listener para o botão "Voltar ao Mapa"
backToMapBtn.addEventListener('click', () => {
    showSection('map-section'); // Volta para a seção do mapa.
});

// Listener para o botão "Voltar à Lista"
backToListBtn.addEventListener('click', () => {
    const currentLocation = selectedLocationName.textContent; // Obtém o nome da localização que estava selecionada.
    showCollaborators(currentLocation); // Volta para a lista de colaboradores daquela localização.
});

// --- Inicialização do Site ---
// Chamadas das funções de inicialização quando a página é carregada.
initMap();      // Inicializa e exibe o mapa Leaflet com os marcadores.
init3DScene();  // Inicializa o ambiente 3D do Three.js (a carteirinha só é adicionada quando um colaborador é selecionado).