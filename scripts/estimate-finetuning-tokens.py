"""Local token estimate only. Downloads a PUBLIC tokenizer, never course data/model weights.

Uses generic ChatML framing, not the provider's private billing implementation.
"""
import hashlib
import json
import statistics
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import tokenizers

directory = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(json.loads(Path('finetuning/current.json').read_text(encoding='utf-8'))['directory'])
cache = Path('finetuning/tokenizer-cache')
cache.mkdir(parents=True, exist_ok=True)
metadata_file = cache / 'qwen3-8b-source.json'
tokenizer_file = cache / 'qwen3-8b-tokenizer.json'
if not tokenizer_file.exists() or not metadata_file.exists():
    with urllib.request.urlopen('https://huggingface.co/api/models/Qwen/Qwen3-8B', timeout=30) as response:
        revision = json.load(response)['sha']
    url = f'https://huggingface.co/Qwen/Qwen3-8B/resolve/{revision}/tokenizer.json'
    with urllib.request.urlopen(url, timeout=45) as response:
        data = response.read()
    tokenizer_file.write_bytes(data)
    metadata_file.write_text(json.dumps({'repository': 'Qwen/Qwen3-8B', 'revision': revision, 'url': url, 'sha256': hashlib.sha256(data).hexdigest()}, indent=2), encoding='utf-8')
source = json.loads(metadata_file.read_text(encoding='utf-8'))
if hashlib.sha256(tokenizer_file.read_bytes()).hexdigest() != source['sha256']:
    raise ValueError('Tokenizer cache checksum mismatch')
tokenizer = tokenizers.Tokenizer.from_file(str(tokenizer_file))
stats = {}
data_root = directory / 'drafts' if (directory / 'drafts').is_dir() else directory
for split in ['train', 'validation', 'test']:
    data_file = data_root / f'{split}.jsonl'
    if not data_file.is_file():
        continue
    lengths = []
    for line in data_file.read_text(encoding='utf-8').splitlines():
        messages = json.loads(line)['messages']
        chatml = ''.join(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n" for m in messages)
        lengths.append(len(tokenizer.encode(chatml, add_special_tokens=False).ids))
    sorted_lengths = sorted(lengths)
    stats[split] = {'samples': len(lengths), 'estimatedTokens': sum(lengths), 'maxTokens': max(lengths), 'meanTokens': round(statistics.mean(lengths), 1), 'p95Tokens': sorted_lengths[int((len(lengths) - 1) * .95)]}
price = .006  # Official Beijing Qwen3-8B training tariff checked 2026-11-03.
report = {
    'recordedAt': datetime.now(timezone.utc).isoformat(), 'tokenizer': source, 'tokenizersVersion': tokenizers.__version__,
    'method': 'Qwen3-8B public tokenizer with generic ChatML framing; estimate only, not a provider quote',
    'stats': stats,
    'feeEstimate': {'currency': 'CNY', 'model': 'qwen3-8b', 'pricePerThousandTokens': price, 'priceCheckedOn': '2026-11-03',
                    'source': 'https://help.aliyun.com/zh/model-studio/model-training-overview',
                    'oneEpoch': round(stats['train']['estimatedTokens'] / 1000 * price, 2),
                    'threeEpochs': round(stats['train']['estimatedTokens'] / 1000 * price * 3, 2),
                    'excludes': ['deployment', 'inference', 'validation charges if applicable', 'data cleaning', 'provider-specific tokenization/framing differences'],
                    'note': ('Based on draft training rows.' if data_root.name == 'drafts' else 'Based on the local reviewed pilot release; review can be automated, not human.') + ' No money spent on training.'},
    'modelWeightsDownloaded': False, 'trainingStarted': False
}
(directory / 'token-estimate.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'stats': stats, 'feeEstimate': report['feeEstimate']}, ensure_ascii=True, indent=2))
