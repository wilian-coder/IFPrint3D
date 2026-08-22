# IFPrint 3D — primeira versão

Sistema web gratuito para receber arquivos de impressão 3D de alunos.

## Estrutura

- `index.html` — formulário público.
- `admin.html` — painel administrativo.
- `style.css` — visual.
- `app.js` — envio dos pedidos e arquivos.
- `admin.js` — painel e alteração de status.
- `firebase-config.js` — configuração do Firebase.
- `firestore.rules` — segurança do banco.
- `storage.rules` — segurança dos arquivos.

## Configuração do Firebase

1. Crie um projeto no Firebase.
2. Crie um Web App dentro do projeto.
3. Copie a configuração para `firebase-config.js`.
4. Ative Authentication:
   - Sign-in method
   - Anonymous = ativado
   - Email/Password = ativado
5. Crie um usuário administrador em Authentication > Users.
6. No `firestore.rules`, substitua `ADMIN_EMAIL_AQUI` pelo e-mail do administrador.
7. No `storage.rules`, substitua `ADMIN_EMAIL_AQUI` pelo mesmo e-mail.
8. Crie o Firestore Database.
9. Publique as regras do Firestore.
10. Ative o Storage e publique as regras.
11. Hospede os arquivos em GitHub Pages, Firebase Hosting ou outro host estático.

## GitHub Pages

O site é estático e não precisa de Node.js.

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta.
3. Vá em Settings > Pages.
4. Escolha Deploy from branch.
5. Selecione a branch `main` e a pasta `/root`.
6. Salve.
7. O GitHub fornecerá o link público.

## Importante

A conta administrativa deve ser criada no Firebase Authentication.
Não coloque a senha do administrador no código.

A primeira versão permite:
- Nome do aluno
- Turma
- Nome do projeto
- Descrição
- Upload de STL, 3MF e OBJ
- Limite de 50 MB
- Banco de dados Firestore
- Armazenamento Firebase Storage
- Login administrativo
- Lista de solicitações
- Pesquisa
- Filtro por status
- Alteração de status
- Download dos arquivos
- Contadores do painel
