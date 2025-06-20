import os
import sqlite3
import uuid
from flask import Flask, jsonify, request, render_template, send_from_directory

# --- Configuration ---
UPLOAD_FOLDER = 'uploads'
DATABASE = 'database.db'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# --- Database Helper Functions ---
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS scripts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sentences (
                id TEXT PRIMARY KEY,
                script_id TEXT NOT NULL,
                text TEXT NOT NULL,
                main_image_id TEXT,
                FOREIGN KEY (script_id) REFERENCES scripts (id) ON DELETE CASCADE
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                sentence_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                FOREIGN KEY (sentence_id) REFERENCES sentences (id) ON DELETE CASCADE
            )
        ''')
        db.commit()

# --- API Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/data', methods=['GET'])
def get_all_data():
    db = get_db()
    scripts_cursor = db.execute('SELECT * FROM scripts ORDER BY name')
    scripts = [dict(row) for row in scripts_cursor.fetchall()]
    
    for script in scripts:
        sentences_cursor = db.execute('SELECT * FROM sentences WHERE script_id = ? ORDER BY rowid', (script['id'],)) # Order by insertion
        sentences = [dict(row) for row in sentences_cursor.fetchall()]
        
        for sentence in sentences:
            images_cursor = db.execute('SELECT * FROM images WHERE sentence_id = ?', (sentence['id'],))
            images = [dict(row) for row in images_cursor.fetchall()]
            sentence['images'] = {img['id']: img for img in images}
            
        script['sentences'] = {s['id']: s for s in sentences}

    app_data = {s['id']: s for s in scripts}
    return jsonify(app_data)

@app.route('/api/scripts', methods=['POST'])
def add_script():
    data = request.get_json()
    script_id = str(uuid.uuid4())
    db = get_db()
    db.execute('INSERT INTO scripts (id, name) VALUES (?, ?)', (script_id, data['name']))
    db.commit()
    return jsonify({'id': script_id, 'name': data['name'], 'sentences': {}})

# NEW: Update a script's name
@app.route('/api/scripts/<script_id>', methods=['PUT'])
def update_script(script_id):
    data = request.get_json()
    db = get_db()
    db.execute('UPDATE scripts SET name = ? WHERE id = ?', (data['name'], script_id))
    db.commit()
    return jsonify({'success': True})

@app.route('/api/scripts/<script_id>', methods=['DELETE'])
def delete_script(script_id):
    db = get_db()
    img_cursor = db.execute('''
        SELECT images.filename FROM images JOIN sentences ON images.sentence_id = sentences.id
        WHERE sentences.script_id = ?
    ''', (script_id,))
    for row in img_cursor.fetchall():
        try:
            os.remove(os.path.join(app.config['UPLOAD_FOLDER'], row['filename']))
        except OSError as e:
            print(f"Error deleting file {row['filename']}: {e}")
    db.execute('DELETE FROM scripts WHERE id = ?', (script_id,))
    db.commit()
    return jsonify({'success': True})

@app.route('/api/sentences', methods=['POST'])
def add_sentence():
    data = request.get_json()
    sentence_id = str(uuid.uuid4())
    db = get_db()
    db.execute('INSERT INTO sentences (id, script_id, text) VALUES (?, ?, ?)',
               (sentence_id, data['script_id'], data['text']))
    db.commit()
    return jsonify({'id': sentence_id, 'script_id': data['script_id'], 'text': data['text'], 'images': {}, 'main_image_id': None})

# NEW: Update a sentence's text
@app.route('/api/sentences/<sentence_id>', methods=['PUT'])
def update_sentence(sentence_id):
    data = request.get_json()
    db = get_db()
    db.execute('UPDATE sentences SET text = ? WHERE id = ?', (data['text'], sentence_id))
    db.commit()
    return jsonify({'success': True})


@app.route('/api/sentences/<sentence_id>', methods=['DELETE'])
def delete_sentence(sentence_id):
    db = get_db()
    img_cursor = db.execute('SELECT filename FROM images WHERE sentence_id = ?', (sentence_id,))
    for row in img_cursor.fetchall():
        try:
            os.remove(os.path.join(app.config['UPLOAD_FOLDER'], row['filename']))
        except OSError as e:
            print(f"Error deleting file {row['filename']}: {e}")
    db.execute('DELETE FROM sentences WHERE id = ?', (sentence_id,))
    db.commit()
    return jsonify({'success': True})

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/images/<sentence_id>', methods=['POST'])
def upload_images(sentence_id):
    if 'files' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    files = request.files.getlist('files')
    db = get_db()
    
    for file in files:
        if file and allowed_file(file.filename):
            filename = str(uuid.uuid4()) + '.' + file.filename.rsplit('.', 1)[1].lower()
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            
            image_id = str(uuid.uuid4())
            db.execute('INSERT INTO images (id, sentence_id, filename) VALUES (?, ?, ?)',
                       (image_id, sentence_id, filename))
    
    cursor = db.execute('SELECT main_image_id FROM sentences WHERE id = ?', (sentence_id,))
    sentence = cursor.fetchone()
    if not sentence['main_image_id']:
        cursor = db.execute('SELECT id FROM images WHERE sentence_id = ? LIMIT 1', (sentence_id,))
        first_image = cursor.fetchone()
        if first_image:
            db.execute('UPDATE sentences SET main_image_id = ? WHERE id = ?', (first_image['id'], sentence_id))

    db.commit()
    return jsonify({'success': True})

@app.route('/api/images/<image_id>', methods=['DELETE'])
def delete_image(image_id):
    db = get_db()
    cursor = db.execute('SELECT filename, sentence_id FROM images WHERE id = ?', (image_id,))
    img_data = cursor.fetchone()
    if not img_data:
        return jsonify({'error': 'Image not found'}), 404

    db.execute('DELETE FROM images WHERE id = ?', (image_id,))
    
    cursor = db.execute('SELECT main_image_id FROM sentences WHERE id = ?', (img_data['sentence_id'],))
    sentence = cursor.fetchone()
    if sentence['main_image_id'] == image_id:
        cursor = db.execute('SELECT id FROM images WHERE sentence_id = ? LIMIT 1', (img_data['sentence_id'],))
        new_main_img = cursor.fetchone()
        new_main_id = new_main_img['id'] if new_main_img else None
        db.execute('UPDATE sentences SET main_image_id = ? WHERE id = ?', (new_main_id, img_data['sentence_id']))

    db.commit()
    
    try:
        os.remove(os.path.join(app.config['UPLOAD_FOLDER'], img_data['filename']))
    except OSError as e:
        print(f"Error deleting file {img_data['filename']}: {e}")
        
    return jsonify({'success': True})

@app.route('/api/images/set_main/<image_id>', methods=['POST'])
def set_main_image(image_id):
    db = get_db()
    cursor = db.execute('SELECT sentence_id FROM images WHERE id = ?', (image_id,))
    img = cursor.fetchone()
    if not img:
        return jsonify({'error': 'Image not found'}), 404
    
    db.execute('UPDATE sentences SET main_image_id = ? WHERE id = ?', (image_id, img['sentence_id']))
    db.commit()
    return jsonify({'success': True})

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)