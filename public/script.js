document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('excelFile');
    const fileLabel = document.querySelector('.file-input-label');
    const uploadBtn = document.getElementById('uploadBtn');
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    const error = document.getElementById('error');
    const newAnalysisBtn = document.getElementById('newAnalysis');
    const tryAgainBtn = document.getElementById('tryAgain');
    
    // Language selection elements
    const dropdownHeader = document.getElementById('dropdownHeader');
    const dropdownContent = document.getElementById('dropdownContent');
    const selectedText = document.getElementById('selectedText');
    const selectedLanguagesDiv = document.getElementById('selectedLanguages');
    
    let selectedLanguages = [];
    let availableLanguages = {};

    // Language flags mapping
    const languageFlags = {
        'french': '🇫🇷',
        'german': '🇩🇪', 
        'hebrew': '🇮🇱',
        'arabic': '🇸🇦',
        'spanish': '🇪🇸',
        'italian': '🇮🇹',
        'portuguese': '🇵🇹',
        'russian': '🇷🇺',
        'chinese': '🇨🇳',
        'japanese': '🇯🇵'
    };

    // Load available languages on page load
    loadLanguages();

    // Update file label when file is selected
    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const fileName = this.files[0].name;
            fileLabel.innerHTML = `<span class="file-icon">📄</span>${fileName}`;
            fileLabel.style.color = '#28a745';
            fileLabel.style.borderColor = '#28a745';
        }
    });

    // Load available languages
    async function loadLanguages() {
        try {
            const response = await fetch('/languages');
            const data = await response.json();
            availableLanguages = data.languages;
            populateLanguageDropdown();
        } catch (err) {
            console.error('Error loading languages:', err);
            // Fallback to hardcoded languages if server is not running
            availableLanguages = {
                'french': 0.35,
                'german': 0.45,
                'hebrew': 0.30,
                'arabic': 0.50,
                'spanish': 0.35,
                'italian': 0.35,
                'portuguese': 0.35,
                'russian': 0.35,
                'chinese': 0.35,
                'japanese': 0.35
            };
            populateLanguageDropdown();
        }
    }

    // Populate language dropdown
    function populateLanguageDropdown() {
        dropdownContent.innerHTML = '';
        
        Object.entries(availableLanguages).forEach(([lang, price]) => {
            const option = document.createElement('div');
            option.className = 'language-option';
            option.dataset.language = lang;
            
            const flag = languageFlags[lang] || '🌍';
            const displayName = lang.charAt(0).toUpperCase() + lang.slice(1);
            
            option.innerHTML = `
                <span class="language-name">${flag} ${displayName}</span>
                <span class="language-price">$${price.toFixed(3)}/word</span>
            `;
            
            option.addEventListener('click', () => toggleLanguage(lang));
            dropdownContent.appendChild(option);
        });
    }

    // Toggle dropdown visibility
    dropdownHeader.addEventListener('click', function() {
        dropdownContent.classList.toggle('show');
        dropdownHeader.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!dropdownHeader.contains(e.target) && !dropdownContent.contains(e.target)) {
            dropdownContent.classList.remove('show');
            dropdownHeader.classList.remove('active');
        }
    });

    // Toggle language selection
    function toggleLanguage(language) {
        const index = selectedLanguages.indexOf(language);
        
        if (index > -1) {
            selectedLanguages.splice(index, 1);
        } else {
            selectedLanguages.push(language);
        }
        
        updateSelectedLanguages();
        updateDropdownOptions();
    }

    // Update selected languages display
    function updateSelectedLanguages() {
        selectedLanguagesDiv.innerHTML = '';
        
        if (selectedLanguages.length === 0) {
            selectedText.textContent = 'Choose languages...';
            return;
        }
        
        selectedText.textContent = `${selectedLanguages.length} language${selectedLanguages.length > 1 ? 's' : ''} selected`;
        
        selectedLanguages.forEach(lang => {
            const tag = document.createElement('div');
            tag.className = 'language-tag';
            
            const flag = languageFlags[lang] || '🌍';
            const displayName = lang.charAt(0).toUpperCase() + lang.slice(1);
            
            tag.innerHTML = `
                <span>${flag} ${displayName}</span>
                <button type="button" class="remove-language" onclick="removeLanguage('${lang}')">×</button>
            `;
            
            selectedLanguagesDiv.appendChild(tag);
        });
    }

    // Remove language (global function for onclick)
    window.removeLanguage = function(language) {
        const index = selectedLanguages.indexOf(language);
        if (index > -1) {
            selectedLanguages.splice(index, 1);
            updateSelectedLanguages();
            updateDropdownOptions();
        }
    };

    // Update dropdown option states
    function updateDropdownOptions() {
        const options = dropdownContent.querySelectorAll('.language-option');
        options.forEach(option => {
            const lang = option.dataset.language;
            if (selectedLanguages.includes(lang)) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    // Handle form submission
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const file = fileInput.files[0];
        if (!file) {
            showError('Please select an Excel file');
            return;
        }

        if (selectedLanguages.length === 0) {
            showError('Please select at least one language');
            return;
        }

        // Show loading state
        showLoading();

        const formData = new FormData();
        formData.append('excelFile', file);
        
        // Add selected languages to form data
        selectedLanguages.forEach(lang => {
            formData.append('languages', lang);
        });

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                showResults(data);
            } else {
                showError(data.error || 'An error occurred while processing the file');
            }
        } catch (err) {
            console.error('Upload error:', err);
            showError('Failed to upload file. Please check your connection and try again.');
        }
    });

    // Reset form for new analysis
    newAnalysisBtn.addEventListener('click', resetForm);
    tryAgainBtn.addEventListener('click', resetForm);

    function showLoading() {
        hideAllSections();
        loading.classList.remove('hidden');
        uploadBtn.disabled = true;
    }

    function showResults(data) {
        hideAllSections();
        
        // Basic info
        document.getElementById('fileName').textContent = data.fileName;
        document.getElementById('wordCount').textContent = data.wordCount.toLocaleString();
        
        // Selected languages
        const languageNames = data.selectedLanguages.map(lang => {
            const flag = languageFlags[lang] || '🌍';
            return `${flag} ${lang.charAt(0).toUpperCase() + lang.slice(1)}`;
        }).join(', ');
        document.getElementById('selectedLanguagesList').textContent = languageNames;
        
        // Language breakdown
        const breakdownDiv = document.getElementById('languageBreakdown');
        breakdownDiv.innerHTML = '';
        
        data.languageBreakdown.forEach(lang => {
            const breakdownItem = document.createElement('div');
            breakdownItem.className = 'breakdown-item';
            
            const flag = languageFlags[lang.language.toLowerCase()] || '🌍';
            const displayName = lang.language.charAt(0).toUpperCase() + lang.language.slice(1);
            
            breakdownItem.innerHTML = `
                <div class="breakdown-language">
                    <span class="breakdown-flag">${flag}</span>
                    <span>${displayName}</span>
                </div>
                <div class="breakdown-details">
                    <div class="breakdown-rate">$${lang.pricePerWord.toFixed(3)}/word</div>
                    <div class="breakdown-cost">$${lang.totalCost.toFixed(2)}</div>
                </div>
            `;
            
            breakdownDiv.appendChild(breakdownItem);
        });
        
        // Grand total
        document.getElementById('grandTotal').textContent = `$${data.grandTotal.toFixed(2)}`;
        
        results.classList.remove('hidden');
        uploadBtn.disabled = false;
    }

    function showError(message) {
        hideAllSections();
        document.getElementById('errorMessage').textContent = message;
        error.classList.remove('hidden');
        uploadBtn.disabled = false;
    }

    function hideAllSections() {
        loading.classList.add('hidden');
        results.classList.add('hidden');
        error.classList.add('hidden');
    }

    function resetForm() {
        hideAllSections();
        uploadForm.reset();
        fileLabel.innerHTML = '<span class="file-icon">📁</span>Choose Excel File';
        fileLabel.style.color = '#6c757d';
        fileLabel.style.borderColor = '#dee2e6';
        
        // Reset language selection
        selectedLanguages = [];
        updateSelectedLanguages();
        updateDropdownOptions();
        
        uploadBtn.disabled = false;
    }
});