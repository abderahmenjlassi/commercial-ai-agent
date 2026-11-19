// Suiveur de ligne - Arduino Uno + L298N + 2 capteurs IR
const int CAPTEUR_G = 2;
const int CAPTEUR_D = 3;
const int ENA = 5, IN1 = 6, IN2 = 7;    // moteur gauche
const int ENB = 10, IN3 = 8, IN4 = 9;   // moteur droit
const int VITESSE = 150;                // 0 a 255

void moteur(int en, int a, int b, int v) {
  digitalWrite(a, v > 0);
  digitalWrite(b, v < 0);
  analogWrite(en, abs(v));
}

void drive(int g, int d) {
  moteur(ENA, IN1, IN2, g);
  moteur(ENB, IN3, IN4, d);
}

void setup() {
  pinMode(CAPTEUR_G, INPUT);
  pinMode(CAPTEUR_D, INPUT);
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
}

void loop() {
  bool g = digitalRead(CAPTEUR_G);   // 1 = ligne noire
  bool d = digitalRead(CAPTEUR_D);
  if (!g && !d)      drive(VITESSE, VITESSE);  // tout droit
  else if (g && !d)  drive(0, VITESSE);        // tourne a gauche
  else if (!g && d)  drive(VITESSE, 0);        // tourne a droite
  else               drive(0, 0);              // stop
}
