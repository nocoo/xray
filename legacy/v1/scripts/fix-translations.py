import json
import os

# Check for OPENAI_API_KEY
api_key = os.environ.get('OPENAI_API_KEY')
if not api_key:
    print("OPENAI_API_KEY not found in environment")
    exit(1)

try:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
except ImportError:
    print("openai package not installed. Install with: pip install openai")
    exit(1)

# Read files
with open('data/raw_tweets.json') as f:
    raw = json.load(f)
with open('data/analyze_output.json') as f:
    analyzed = json.load(f)

# Create a map of analyzed items
analyzed_map = {item['id']: item for item in analyzed['items']}

# Find English tweets needing translation
tweets_to_translate = []
for tweet in raw['tweets']:
    if tweet['lang'] == 'en':
        analyzed_item = analyzed_map.get(tweet['id'])
        if analyzed_item is None or analyzed_item.get('translation', '') == '':
            tweets_to_translate.append(tweet)

print(f"Found {len(tweets_to_translate)} English tweets needing translation")

# Batch translate (limit to first 20 to save tokens)
if tweets_to_translate:
    texts = [t['text'] for t in tweets_to_translate[:20]]

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "你是一个专业的翻译。将以下英文推文翻译成中文。保持原意和风格。输出格式：每行一个翻译，与输入顺序对应，不要添加序号。"
            },
            {
                "role": "user",
                "content": "\n\n".join(texts)
            }
        ],
        temperature=0.3
    )

    translations = response.choices[0].message.content.split('\n\n')

    # Update analyze_output.json
    for i, tweet in enumerate(tweets_to_translate[:20]):
        if i < len(translations):
            translation = translations[i].strip()
            # Remove [N] prefix if present
            if translation.startswith('['):
                translation = translation.split(']', 1)[1].strip() if ']' in translation else translation

            # Find and update the item
            for item in analyzed['items']:
                if item['id'] == tweet['id']:
                    item['translation'] = translation
                    break

    # Save updated analyze_output.json
    with open('data/analyze_output.json', 'w') as f:
        json.dump(analyzed, f, ensure_ascii=False, indent=2)

    print(f"Translated {len(tweets_to_translate[:20])} tweets")
else:
    print("No English tweets need translation")
