import io
import json
from flask import Flask, render_template, request, jsonify
from PIL import Image
import google.generativeai as genai

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# =========================
# GEMINI API KEY
# =========================

GEMINI_API_KEY = " "             ### Enter your GEMINI_API_KEY

genai.configure(api_key=GEMINI_API_KEY)

model = genai.GenerativeModel("gemini-2.5-flash")

GEMINI_PROMPT = """
You are an expert agricultural botanist and plant pathologist.

Analyze this plant/leaf image and return ONLY a valid JSON object.

JSON format:
{
  "plant_name": "Common name of the plant",
  "is_plant": true,
  "is_healthy": true,
  "disease_name": "Healthy",
  "confidence": 90,
  "severity": "none",
  "causes": ["cause1","cause2","cause3"],
  "treatment": ["step1","step2","step3","step4","step5"],
  "medicine": ["Medicine Name 1 - Dosage/Quantity and usage method", "Medicine Name 2 - Dosage"],
  "prevention": ["tip1","tip2","tip3"]
}
    
severity options:
none
moderate
severe
critical

Return JSON only.
"""

def allowed_file(filename):
    return (
        '.' in filename and
        filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
    )

def analyze_image(image_bytes, language="hi"):
    try:
        image = Image.open(io.BytesIO(image_bytes))

        lang_map = {
            "hi": "Hindi",
            "en": "English",
            "bn": "Bengali",
            "ur": "Urdu",
            "ta": "Tamil",
            "te": "Telugu",
            "mr": "Marathi",
            "gu": "Gujarati",
            "pa": "Punjabi"
        }

        response_language = lang_map.get(language, "English")

        prompt = GEMINI_PROMPT + f"""

IMPORTANT:

Return ALL values in {response_language} language.

Translate:
- plant_name
- disease_name
- causes
- treatment
- medicine
- prevention

Keep JSON keys in English.
Translate only values.

If language is Hindi then return:
"गुलाब", "पाउडरी मिल्ड्यू", etc.

Return JSON only.
"""

        response = model.generate_content(
            [prompt, image]
        )

        raw_text = response.text.strip()

        if "```json" in raw_text:
            raw_text = raw_text.replace("```json", "")
            raw_text = raw_text.replace("```", "")
            raw_text = raw_text.strip()

        data = json.loads(raw_text)

        return data, None

    except json.JSONDecodeError:
        return None, "Gemini API failed to return a valid JSON response."

    except Exception as e:
        return None, f"Gemini Error: {str(e)}"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/analyze", methods=["POST"])
def analyze():

    if "image" not in request.files:
        return jsonify({"error": "No image provided in the request."}), 400

    file = request.files["image"]

    if file.filename == "":
        return jsonify({"error": "No file selected for upload."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type. Only PNG, JPG, JPEG, and WEBP are allowed."}), 400

    image_bytes = file.read()

    language = request.form.get("lang", "hi")
    print("Selected Language =", language)

    result, error = analyze_image(image_bytes, language)

    if error:
        return jsonify({"error": error}), 500

    if not result.get("is_plant", True):
        return jsonify({
            "error": "The image does not appear to be a plant. Please upload a clear photo of a leaf or crop."
        }), 400

    result["source"] = "gemini"

    return jsonify({"result": result})

if __name__ == "__main__":
    print("\n🌿 CropGuard Gemini Server")
    print("=" * 40)
    print("Gemini AI : READY")
    print("Open: http://localhost:5000")
    print("=" * 40)

    app.run(
        debug=True,
        host="0.0.0.0",
        port=5000
    )
