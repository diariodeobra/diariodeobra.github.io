# Controle de Ferramentas ECTAS: instalação da central

O app do técnico fica em **https://diariodeobra.github.io/ferramentas/**.
O painel do supervisor fica em **https://diariodeobra.github.io/ferramentas/supervisor.html**.

Os dois funcionam no mesmo modelo do Diário de Obra: os dados ficam numa planilha do Google e a central é um Google Apps Script. O cadastro de usuários é separado do Diário.

## Ligar a central (uma vez só, cerca de 10 minutos)

1. Entre no Google com a conta da central (a mesma do Diário: diariodeobra.ectas@gmail.com) e abra https://script.google.com.
2. Clique em **Novo projeto** e dê o nome **Controle de Ferramentas ECTAS - Central**.
3. Apague o conteúdo de `Código.gs` e cole todo o conteúdo do arquivo `central-ferramentas-Code.gs.txt` desta pasta. Salve.
4. No menu de funções, escolha **configurar** e clique em **Executar**. Autorize o acesso (Planilhas, Drive, e-mail e gatilhos).
   Isso cria a planilha "Controle de Ferramentas ECTAS - Base" com as 56 ferramentas, os 3 kits e os 186 códigos FER-0001 a FER-0186.
5. Clique em **Implantar > Nova implantação**, tipo **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Copie o endereço que termina em `/exec` e coloque no arquivo `config.js` (campo `url`), ou envie para quem mantém o site.

## Primeiro acesso do supervisor

1. Abra o painel. Na primeira vez ele pede para **criar a senha do painel** (vence a cada 90 dias).
2. Em **Cadastro > Técnicos**, cadastre cada técnico com usuário e senha.
3. Em **Cadastro > Kits**, preencha responsável e local, e marque quais técnicos podem conferir cada kit (nenhum marcado = todos).
4. Em **Configurações**, cadastre os e-mails do aviso diário e o e-mail de recuperação da senha.
5. Em **Códigos e etiquetas**, baixe o PDF das etiquetas (Pimaco A4356 ou equivalente, 33 por folha).

## Atualizar a central depois

Ao trocar o código do Apps Script, use **Implantar > Gerenciar implantações > Editar > Nova versão**. Assim o endereço `/exec` continua o mesmo.
