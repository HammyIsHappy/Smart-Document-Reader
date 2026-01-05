class SmartDocumentReader {
    constructor() {
        this.currentText = '';
        this.sentences = [];
        this.currentSentence = 0;
        this.isPlaying = false;
        this.speechSynth = window.speechSynthesis;
        this.utterance = null;
        this.voices = [];
        this.accessibilityMode = true;
        this.accessibilityIssues = [];
        
        this.initializeElements();
        this.bindEvents();
        this.setupAccessibility();
        this.loadVoices();
        this.loadSettings();
    }

    initializeElements() {
        this.fileInput = document.getElementById('file-input');
        this.contentDiv = document.getElementById('document-content');
        this.playButton = document.getElementById('play-pause');
        this.speedSlider = document.getElementById('speed');
        this.accessibilityBtn = document.getElementById('accessibility-mode');
        this.analysisResults = document.getElementById('analysis-results');
        this.modeDescription = document.getElementById('mode-description');
        this.currentSentenceSpan = document.getElementById('current-sentence');
        this.totalSentencesSpan = document.getElementById('total-sentences');
    }

    bindEvents() {
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        this.playButton.addEventListener('click', () => this.togglePlayback());
        this.speedSlider.addEventListener('input', (e) => this.updateSpeed(e.target.value));
        this.accessibilityBtn.addEventListener('click', () => this.toggleAccessibilityMode());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    setupAccessibility() {
        // Start in accessibility mode by default
        document.body.classList.add('accessibility-mode');
        this.accessibilityBtn.textContent = 'Normal Mode';
        // Announce page load to screen readers
        this.announceToScreenReader('Smart Document Reader loaded in accessibility mode. Upload a document to begin.');
    }

    loadVoices() {
        const loadVoicesWhenReady = () => {
            this.voices = this.speechSynth.getVoices();
            if (this.voices.length === 0) {
                setTimeout(loadVoicesWhenReady, 100);
            }
        };
        
        if (this.speechSynth.onvoiceschanged !== undefined) {
            this.speechSynth.onvoiceschanged = loadVoicesWhenReady;
        }
        
        loadVoicesWhenReady();
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            let text = '';
            
            if (file.type === 'text/plain') {
                text = await this.readTextFile(file);
            } else if (file.type === 'application/pdf') {
                text = await this.readPDFFile(file);
            } else {
                this.showError('Unsupported file type. Please use .txt or .pdf files.');
                return;
            }

            this.processDocument(text);
            this.analyzeAccessibility(text);
            this.announceToScreenReader(`Document loaded: ${file.name}. ${this.sentences.length} sentences ready for reading.`);
            
        } catch (error) {
            this.showError('Error reading file: ' + error.message);
        }
    }

    readTextFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read text file'));
            reader.readAsText(file);
        });
    }

    async readPDFFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const pdf = await pdfjsLib.getDocument(e.target.result).promise;
                    let fullText = '';
                    
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }
                    
                    resolve(fullText);
                } catch (error) {
                    reject(new Error('Failed to read PDF file'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to load PDF file'));
            reader.readAsArrayBuffer(file);
        });
    }

    processDocument(text) {
        this.currentText = text;
        
        // Preserve document structure by converting to HTML with proper formatting
        let formattedText = text
            // Convert headings
            .replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, title) => {
                const level = hashes.length;
                return `<h${level}>${title}</h${level}>`;
            })
            // Convert bold text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Convert italic text
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // Convert line breaks to paragraphs
            .split('\n\n')
            .map(paragraph => paragraph.trim())
            .filter(paragraph => paragraph.length > 0)
            .map(paragraph => {
                // Don't wrap headings in paragraphs
                if (paragraph.startsWith('<h')) {
                    return paragraph;
                }
                return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
            })
            .join('\n');
        
        // Create a temporary div to parse the HTML and extract sentences
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formattedText;
        
        // Extract sentences while preserving structure
        this.sentences = [];
        this.extractSentencesFromElement(tempDiv);
        
        this.displayDocument(formattedText);
        this.resetPlayback();
    }
    
    extractSentencesFromElement(element) {
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
                    this.sentences.push(...sentences.map(s => s.trim()).filter(s => s.length > 0));
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                this.extractSentencesFromElement(node);
            }
        }
    }

    analyzeAccessibility(text) {
        this.accessibilityIssues = [];
        
        // Analyze sentence complexity
        const avgSentenceLength = this.sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / this.sentences.length;
        if (avgSentenceLength > 20) {
            this.accessibilityIssues.push({
                type: 'Sentence Complexity',
                severity: 'high',
                description: `Average sentence length: ${Math.round(avgSentenceLength)} words (recommended: <20)`,
                impact: 'Difficult for screen readers and cognitive processing'
            });
        }
        
        // Analyze document structure
        const hasHeadings = /^(#|Chapter|Section|Part)/m.test(text);
        if (!hasHeadings && this.sentences.length > 10) {
            this.accessibilityIssues.push({
                type: 'Document Structure',
                severity: 'medium',
                description: 'No clear headings or structure detected',
                impact: 'Difficult navigation for assistive technologies'
            });
        }
        
        // Analyze text density
        const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
        const avgParagraphLength = text.length / paragraphs.length;
        if (avgParagraphLength > 500) {
            this.accessibilityIssues.push({
                type: 'Text Density',
                severity: 'medium',
                description: 'Large text blocks detected',
                impact: 'Overwhelming for users with reading difficulties'
            });
        }
        
        this.displayAccessibilityAnalysis();
    }
    
    displayAccessibilityAnalysis() {
        // Calculate accessibility score
        let score = 100;
        let riskLevel = 'Low Risk';
        
        this.accessibilityIssues.forEach(issue => {
            if (issue.severity === 'high') score -= 15;
            else if (issue.severity === 'medium') score -= 8;
            else score -= 3;
        });
        
        if (score < 70) riskLevel = 'High Risk';
        else if (score < 85) riskLevel = 'Medium Risk';
        
        let html = `<div class="accessibility-score">Accessibility Score: ${score}/100 (${riskLevel})</div>`;
        
        if (this.accessibilityIssues.length === 0) {
            html += '<div class="barrier-item low"><span><strong>✓ No major accessibility barriers detected</strong></span><span class="severity-badge low">LOW</span></div>';
        } else {
            html += '<h3>Accessibility Barriers Detected:</h3>';
            this.accessibilityIssues.forEach(issue => {
                html += `
                    <div class="barrier-item ${issue.severity}">
                        <div>
                            <strong>${issue.type}:</strong> ${issue.description}<br>
                            <small><em>Impact: ${issue.impact}</em></small>
                        </div>
                        <span class="severity-badge ${issue.severity}">${issue.severity.toUpperCase()}</span>
                    </div>
                `;
            });
            
            // Smart recommendations based on detected issues
            const hasComplexity = this.accessibilityIssues.some(i => i.type === 'Sentence Complexity');
            const hasStructure = this.accessibilityIssues.some(i => i.type === 'Document Structure');
            const hasDensity = this.accessibilityIssues.some(i => i.type === 'Text Density');
            
            let recommendation = '<p><strong>Recommended:</strong> ';
            if (hasComplexity) {
                recommendation += 'Vision Mode with audio and sentence highlighting for complex text. ';
            } else if (hasStructure) {
                recommendation += 'Use sentence-by-sentence navigation for better structure. ';
            } else if (hasDensity) {
                recommendation += 'Audio mode with chunked reading for dense content. ';
            } else {
                recommendation += 'Document is well-structured for all accessibility modes. ';
            }
            recommendation += '</p>';
            html += recommendation;
        }
        
        this.analysisResults.innerHTML = html;
    }

    displayDocument(formattedText) {
        // If we have formatted HTML, use it; otherwise fall back to sentence spans
        if (formattedText) {
            this.contentDiv.innerHTML = formattedText;
            
            // Add sentence spans to text nodes for highlighting
            this.addSentenceSpans(this.contentDiv);
        } else {
            // Fallback for plain text
            const htmlContent = this.sentences.map((sentence, index) => 
                `<span class="sentence" data-index="${index}">${sentence}</span>`
            ).join(' ');
            this.contentDiv.innerHTML = htmlContent;
        }
        
        this.contentDiv.setAttribute('aria-label', `Document content with ${this.sentences.length} sentences`);
        
        // Update progress display
        this.totalSentencesSpan.textContent = this.sentences.length;
        this.updateProgress();
    }
    
    addSentenceSpans(element) {
        let sentenceIndex = 0;
        
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim()) {
                textNodes.push(node);
            }
        }
        
        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
            
            if (sentences.length > 0) {
                const span = document.createElement('span');
                sentences.forEach((sentence, index) => {
                    const sentenceSpan = document.createElement('span');
                    sentenceSpan.className = 'sentence';
                    sentenceSpan.setAttribute('data-index', sentenceIndex++);
                    sentenceSpan.textContent = sentence;
                    span.appendChild(sentenceSpan);
                    if (index < sentences.length - 1) {
                        span.appendChild(document.createTextNode(' '));
                    }
                });
                textNode.parentNode.replaceChild(span, textNode);
            }
        });
    }

    toggleAccessibilityMode() {
        this.accessibilityMode = !this.accessibilityMode;
        document.body.classList.toggle('accessibility-mode', this.accessibilityMode);
        
        this.accessibilityBtn.textContent = this.accessibilityMode ? 'Normal Mode' : 'Accessibility Mode';
        
        if (this.accessibilityMode) {
            this.modeDescription.innerHTML = '<strong>Accessibility Mode Active:</strong> High contrast, large text, and optimized formatting for enhanced readability.';
        } else {
            this.modeDescription.innerHTML = '<strong>Normal Mode Active:</strong> Standard text formatting with accessibility features available.';
        }
        
        this.saveSettings();
        this.announceToScreenReader(`${this.accessibilityMode ? 'Accessibility' : 'Normal'} mode activated`);
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.pauseReading();
        } else {
            this.startReading();
        }
    }

    startReading() {
        if (this.sentences.length === 0) {
            this.announceToScreenReader('No document loaded. Please upload a file first.');
            return;
        }

        this.isPlaying = true;
        this.playButton.textContent = '⏸ Pause';
        this.playButton.setAttribute('aria-label', 'Pause text-to-speech');
        
        this.readCurrentSentence();
    }

    pauseReading() {
        this.isPlaying = false;
        this.playButton.textContent = '▶ Play';
        this.playButton.setAttribute('aria-label', 'Play text-to-speech');
        
        if (this.utterance) {
            this.speechSynth.cancel();
        }
    }

    readCurrentSentence() {
        if (!this.isPlaying || this.currentSentence >= this.sentences.length) {
            this.pauseReading();
            return;
        }

        // Highlight current sentence
        this.highlightSentence(this.currentSentence);
        
        // Create speech utterance with natural voice
        this.utterance = new SpeechSynthesisUtterance(this.sentences[this.currentSentence]);
        
        // Get the best available voice
        const voices = this.speechSynth.getVoices();
        const preferredVoice = voices.find(voice => 
            voice.name.includes('Natural') || 
            voice.name.includes('Enhanced') ||
            voice.name.includes('Premium') ||
            voice.name.includes('Neural') ||
            (voice.lang.startsWith('en') && voice.localService)
        ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
        
        if (preferredVoice) {
            this.utterance.voice = preferredVoice;
        }
        
        this.utterance.rate = parseFloat(this.speedSlider.value);
        this.utterance.pitch = 1.1;
        this.utterance.volume = 1;

        // Set up event handlers
        this.utterance.onend = () => {
            this.currentSentence++;
            this.updateProgress();
            
            if (this.currentSentence < this.sentences.length && this.isPlaying) {
                setTimeout(() => this.readCurrentSentence(), 200);
            } else {
                this.pauseReading();
                this.announceToScreenReader('Document reading complete.');
            }
        };

        this.utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            this.pauseReading();
        };

        // Start speaking
        this.speechSynth.speak(this.utterance);
        this.updateProgress();
    }

    highlightSentence(index) {
        // Remove previous highlights
        document.querySelectorAll('.current-sentence').forEach(el => {
            el.classList.remove('current-sentence');
        });

        // Add highlight to current sentence
        const sentenceElement = document.querySelector(`[data-index="${index}"]`);
        if (sentenceElement) {
            sentenceElement.classList.add('current-sentence');
            sentenceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    updateProgress() {
        this.currentSentenceSpan.textContent = this.currentSentence + 1;
    }

    updateSpeed(speed) {
        if (this.utterance && this.isPlaying) {
            // Cancel current utterance and restart with new speed
            this.speechSynth.cancel();
            setTimeout(() => this.readCurrentSentence(), 200);
        }
    }

    resetPlayback() {
        this.currentSentence = 0;
        this.pauseReading();
        this.updateProgress();
        
        // Remove all highlights
        document.querySelectorAll('.current-sentence').forEach(el => {
            el.classList.remove('current-sentence');
        });
    }

    loadSettings() {
        const settings = localStorage.getItem('smartDocumentReader');
        if (settings) {
            const parsed = JSON.parse(settings);
            if (parsed.accessibilityMode) this.toggleAccessibilityMode();
            if (parsed.speed) this.speedSlider.value = parsed.speed;
        }
    }
    
    saveSettings() {
        const settings = {
            accessibilityMode: this.accessibilityMode,
            speed: this.speedSlider.value
        };
        localStorage.setItem('smartDocumentReader', JSON.stringify(settings));
    }

    handleKeyboard(event) {
        // Keyboard shortcuts for accessibility
        if (event.ctrlKey || event.metaKey) {
            switch(event.key) {
                case ' ':
                    event.preventDefault();
                    this.togglePlayback();
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    if (this.currentSentence < this.sentences.length - 1) {
                        this.currentSentence++;
                        if (this.isPlaying) {
                            this.speechSynth.cancel();
                            setTimeout(() => this.readCurrentSentence(), 200);
                        }
                    }
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    if (this.currentSentence > 0) {
                        this.currentSentence--;
                        if (this.isPlaying) {
                            this.speechSynth.cancel();
                            setTimeout(() => this.readCurrentSentence(), 200);
                        }
                    }
                    break;
            }
        }
    }

    announceToScreenReader(message) {
        // Create temporary element for screen reader announcements
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        setTimeout(() => document.body.removeChild(announcement), 1000);
    }

    showError(message) {
        this.contentDiv.innerHTML = `<div style="color: red; font-weight: bold;">Error: ${message}</div>`;
        this.announceToScreenReader(`Error: ${message}`);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SmartDocumentReader();
});