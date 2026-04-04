export const identifierDocument = async (imageUri: string) => {
  const choix = ['CARROSSERIE', 'FACTURE', 'CG'];
  const resultat = choix[Math.floor(Math.random() * choix.length)];
 
  // Cette ligne va faire apparaître une alerte sur ton écran !
  alert("L'IA a classé ce document en : " + resultat);

  return { type: resultat, confiance: 0.95 };
};