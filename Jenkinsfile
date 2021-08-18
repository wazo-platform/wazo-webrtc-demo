pipeline {
    agent { docker { image 'demo' } }
    stages {
        stage('build') {
            steps {
                sh 'npm --version'
            }
        }
    }
}