// Otimização de fotos antes do upload (2026-08-04): converte pra WebP,
// redimensiona (máx. ~2000px no lado maior) e descarta metadados (EXIF —
// GPS, modelo de câmera etc.) — tudo client-side, via Canvas nativo do
// navegador, sem nenhuma biblioteca nova. `createImageBitmap` com
// `imageOrientation: 'from-image'` aplica a rotação correta da EXIF antes
// de descartá-la, então a foto não fica de lado depois da conversão.
// `canvas.toBlob` só captura os pixels — metadados nunca chegam no blob
// resultante, é assim que a limpeza acontece (não precisa de lib de EXIF).
const MAX_DIMENSAO = 2000;
const QUALIDADE_WEBP = 0.85;

// GIF (perderia a animação, Canvas só captura um frame) e SVG (vetor, não
// faz sentido rasterizar) ficam de fora de propósito.
const TIPOS_IGNORADOS = new Set(['image/gif', 'image/svg+xml']);

// Fotos HEIC/HEIF (formato padrão de câmera do iPhone) — achado real
// (2026-08-26): o navegador quase nunca reporta um `file.type` reconhecível
// pra esses arquivos (fica `''`), então a checagem antiga
// (`!file.type.startsWith('image/')`) descartava a otimização pra elas e o
// arquivo original subia sem conversão — por isso fotos de paciente
// apareciam quebradas na Timeline (Chrome/a maioria dos navegadores não
// sabe exibir HEIC, só o Safari). `createImageBitmap` também não decodifica
// HEIC fora do Safari, então esse formato precisa de uma conversão à parte
// (via `heic2any`, WASM, roda 100% no navegador) antes de entrar no mesmo
// pipeline de redimensionar+WebP que todo outro formato já passa.
const EXTENSOES_HEIC = /\.hei[cf]$/i;
function pareceHeic(file) {
  return file.type === 'image/heic' || file.type === 'image/heif' || EXTENSOES_HEIC.test(file.name);
}

export async function otimizarImagem(file) {
  const ehHeic = pareceHeic(file);
  // Tipo reconhecido e explicitamente fora do pipeline (GIF/SVG) — mantém
  // como está. HEIC passa direto (mesmo sem `file.type` de imagem
  // reconhecido) porque tratamos ele à parte logo abaixo.
  if (!ehHeic && (!file.type.startsWith('image/') || TIPOS_IGNORADOS.has(file.type))) return file;

  if (ehHeic) {
    try {
      const heic2any = (await import('heic2any')).default;
      const convertido = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      const blobJpeg = Array.isArray(convertido) ? convertido[0] : convertido;
      file = new File([blobJpeg], file.name.replace(EXTENSOES_HEIC, '.jpg'), { type: 'image/jpeg' });
    } catch (erro) {
      // Arquivo que só parece HEIC pela extensão, ou HEIC de verdade que o
      // decoder não deu conta — mantém o original em vez de falhar o
      // upload inteiro por causa da otimização (mesma filosofia do catch
      // do createImageBitmap logo abaixo).
      console.error('Falha ao converter HEIC, mantendo arquivo original:', erro);
      return file;
    }
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Formato que o navegador não sabe decodificar (raro) — mantém o original
    // em vez de falhar o upload inteiro por causa da otimização.
    return file;
  }

  const escala = Math.min(1, MAX_DIMENSAO / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * escala);
  const height = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', QUALIDADE_WEBP));
  if (!blob) return file; // navegador sem suporte a codificar WebP (raríssimo hoje em dia)

  const novoNome = file.name.replace(/\.[^./\\]+$/, '') + '.webp';
  return new File([blob], novoNome, { type: 'image/webp' });
}

const QUALIDADE_JPEG = 0.92;

function dispararDownload(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Download de fotos (2026-08-20): as fotos ficam salvas em WebP no Storage
// (pra não pesar), mas o Dr. quer baixar em JPG (formato universal). Busca
// o arquivo assinado, decodifica no Canvas (mesma técnica de
// `otimizarImagem`) e reexporta como JPEG — o WebP original no Storage
// nunca é alterado, essa conversão só acontece no navegador, no momento do
// download. JPEG não tem canal alfa, por isso pinta um fundo branco antes
// de desenhar a imagem (evita preto onde a foto original tinha
// transparência). Se a conversão falhar por qualquer motivo (CORS do
// Storage bloqueando o fetch, navegador sem suporte a decodificar WebP
// etc.), cai para baixar o arquivo original do jeito que está.
export async function baixarComoJpg(url, nomeArquivo) {
  const nomeBase = nomeArquivo.replace(/\.[^./\\]+$/, '') || 'foto';
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`fetch falhou: ${resposta.status}`);
    const blobOriginal = await resposta.blob();
    const bitmap = await createImageBitmap(blobOriginal);

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blobJpg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG));
    if (!blobJpg) throw new Error('canvas.toBlob não retornou um blob JPEG');

    dispararDownload(blobJpg, `${nomeBase}.jpg`);
    return { convertido: true };
  } catch (err) {
    console.error('Não foi possível converter a foto para JPG, baixando no formato original:', err);
    try {
      const resposta = await fetch(url);
      const blobOriginal = await resposta.blob();
      dispararDownload(blobOriginal, nomeArquivo);
    } catch {
      // Nem o fetch pro fallback funcionou (ex: rede caiu entre as duas
      // tentativas) — último recurso é deixar o navegador navegar pra URL
      // assinada diretamente, que baixa ou abre o arquivo original.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return { convertido: false };
  }
}
