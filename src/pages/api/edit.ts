import type { APIRoute } from 'astro';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-3.1-flash-image-preview';
const STANDARD_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const HEIC_IMAGE_TYPES = new Set([
	'image/heic',
	'image/heif',
	'image/heic-sequence',
	'image/heif-sequence',
]);
const ACCEPTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif']);
const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
	gif: 'image/gif',
	heic: 'image/heic',
	heif: 'image/heif',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
};
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type AssistantTextPart = {
	type?: string;
	text?: string;
};

const json = (body: Record<string, unknown>, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json',
		},
	});

const buildPrompt = (subjectDescription: string) =>
	`A sophisticated, kirakira-styled flat-lay photograph presented within a white, slightly aged Polaroid-style frame. [The central focus is a curated arrangement of the key items from the user's provided image, like a ${subjectDescription}.] If multiple items are provided, they are clustered neatly, similar to the arrangement in image_1.png.
The items rest on a mix of textures: a soft, plush white and pink faux-fur blanket and a smooth, clean white fabric. Scattered aesthetic details include large pearl beads, dried rose petals, and delicate rose-gold metal charms (hearts, stars).
The photo itself is within a Polaroid frame with a faded, slightly light-exposed border. On the bottom white margin of the Polaroid frame, two small, elegant text lines are present. Top line (generic quote): "FAVORITE ESSENTIALS ✨". Bottom line (generic hashtags): "#YourStyle #TechAesthetic".
The entire scene is bathed in soft, natural sunlight and is covered with a subtle overall glitter dust overlay and small, sparkling star-shaped lens flare effects (the 'kirakira' effect).`;

const extractGeneratedImage = (payload: any) => {
	const message = payload?.choices?.[0]?.message;
	const images = Array.isArray(message?.images) ? message.images : [];

	for (const image of images) {
		const url = image?.image_url?.url ?? image?.imageUrl?.url;
		if (typeof url === 'string' && url.length > 0) {
			return url;
		}
	}

	const content = Array.isArray(message?.content) ? message.content : [];
	for (const entry of content) {
		const url = entry?.image_url?.url ?? entry?.imageUrl?.url;
		if (typeof url === 'string' && url.length > 0) {
			return url;
		}
	}

	return null;
};

const extractAssistantMessage = (payload: any) => {
	const message = payload?.choices?.[0]?.message;
	if (typeof message?.content === 'string') {
		return message.content;
	}

	const parts = Array.isArray(message?.content) ? message.content : [];
	return parts
		.filter((part: AssistantTextPart) => part?.type === 'text' && typeof part.text === 'string')
		.map((part: AssistantTextPart) => part.text as string)
		.join('\n')
		.trim();
};

const getFileExtension = (fileName: string) => fileName.toLowerCase().split('.').pop() ?? '';

const getMimeType = (file: File) => {
	if (file.type) {
		return file.type.toLowerCase();
	}

	return MIME_TYPE_BY_EXTENSION[getFileExtension(file.name)] ?? '';
};

const isAcceptedImage = (file: File) => {
	const mimeType = getMimeType(file);
	if (STANDARD_IMAGE_TYPES.has(mimeType) || HEIC_IMAGE_TYPES.has(mimeType)) {
		return true;
	}

	return ACCEPTED_EXTENSIONS.has(getFileExtension(file.name));
};

const isHeicFile = (file: File) => {
	const mimeType = getMimeType(file);
	if (HEIC_IMAGE_TYPES.has(mimeType)) {
		return true;
	}

	const extension = getFileExtension(file.name);
	return extension === 'heic' || extension === 'heif';
};

const loadHeicConverter = async () => {
	const module = await import('heic-convert');
	return module.default;
};

const prepareImageDataUrl = async (file: File) => {
	const inputBuffer = Buffer.from(await file.arrayBuffer());

	if (isHeicFile(file)) {
		const heicConvert = await loadHeicConverter();
		const convertedBuffer = await heicConvert({
			buffer: inputBuffer,
			format: 'JPEG',
			quality: 0.92,
		});
		const normalizedBuffer =
			convertedBuffer instanceof ArrayBuffer
				? Buffer.from(new Uint8Array(convertedBuffer))
				: Buffer.from(convertedBuffer);

		return `data:image/jpeg;base64,${normalizedBuffer.toString('base64')}`;
	}

	const mimeType = getMimeType(file);
	return `data:${mimeType};base64,${inputBuffer.toString('base64')}`;
};

export const POST: APIRoute = async ({ request, site }) => {
	const apiKey = import.meta.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return json(
			{
				error: 'OPENROUTER_API_KEY が未設定です。',
			},
			500,
		);
	}

	const formData = await request.formData();
	const image = formData.get('image');
	const subjectDescription = String(formData.get('subjectDescription') ?? '').trim();
	const aspectRatio = String(formData.get('aspectRatio') ?? '4:5').trim();

	if (!(image instanceof File)) {
		return json(
			{
				error: '画像ファイルを受け取れませんでした。',
			},
			400,
		);
	}

	if (!subjectDescription) {
		return json(
			{
				error: '被写体の説明を入力してください。',
			},
			400,
		);
	}

	if (!isAcceptedImage(image)) {
		return json(
			{
				error: '対応形式は PNG / JPEG / WEBP / GIF / HEIC / HEIF のみです。',
			},
			400,
		);
	}

	if (image.size > MAX_FILE_SIZE_BYTES) {
		return json(
			{
				error: '画像サイズは 10MB 以下にしてください。',
			},
			400,
		);
	}

	const prompt = buildPrompt(subjectDescription);
	let base64Image: string;

	try {
		base64Image = await prepareImageDataUrl(image);
	} catch {
		return json(
			{
				error: 'HEIC / HEIF の変換に失敗しました。別の画像で再試行してください。',
			},
			400,
		);
	}

	const response = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': site?.toString() ?? 'http://localhost:4321',
			'X-Title': 'Tech Kirakira Studio',
		},
		body: JSON.stringify({
			model: MODEL,
			modalities: ['image', 'text'],
			stream: false,
			image_config: {
				aspect_ratio: aspectRatio,
			},
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: prompt,
						},
						{
							type: 'image_url',
							image_url: {
								url: base64Image,
							},
						},
					],
				},
			],
		}),
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		return json(
			{
				error:
					payload?.error?.message ??
					payload?.error ??
					'OpenRouter API からエラーが返されました。',
			},
			response.status,
		);
	}

	const imageUrl = extractGeneratedImage(payload);
	if (!imageUrl) {
		return json(
			{
				error: '生成結果から画像データを取得できませんでした。',
			},
			502,
		);
	}

	return json({
		imageUrl,
		message: extractAssistantMessage(payload),
		prompt,
	});
};
