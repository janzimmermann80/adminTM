import { useState, useEffect, useRef } from 'react'
import { getMailContext, sendMail, getEmailTemplates, saveEmailTemplates } from '../api'
import { Spinner } from './Spinner'

interface Props {
  companyKey: string
  initialEmail?: string
  onClose: () => void
}

export interface EmailTemplate {
  id: string
  group: string
  label: string
  subject: string
  text: string
  note_type: string
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  // ── Noví uživatelé ────────────────────────────────────────────────────────
  { id: '0', group: 'Noví uživatelé', label: 'Obecný e-mail', note_type: '0',
    subject: 'TruckManager.eu',
    text: 'Dobry den <+acc_sex+> <+acc_name+>,\n\n\n\nTesime se na spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\n\n1.Ceska obchodni, spol. s r.o.\nPotocni 340\n592 14 Nove Veseli\nCzech Republic\nVAT:CZ607 433 95\n\nprovider of server\n<a href=http://www.truckagenda.eu>TruckAgenda.eu</a>' },
  { id: '2', group: 'Noví uživatelé', label: 'Registrace - přístupové informace', note_type: 'O',
    subject: 'TruckManager.eu - registrace a pristupove informace',
    text: 'Zprava pro: <+company+>\n\nDobry den <+acc_sex+> <+acc_name+>,\n\ndnes jsme provedli Vasi registraci v systému TruckManager.eu\nVas pristup byl otevren do <+admittance_date+>.\nVase pristupove udaje:\nuz.jmeno: <+username+>\n   heslo: <+password+>\n<a href=https://app.truckmanager.eu>app.truckmanager.eu</a>\n\nStazeni aplikace TruckManager pro Android a manualy <a href=https://truckmanager.eu/stahuj>zde</a>\nManual pro praci s aplikaci formou animaci maji ridici k dispozici i na jeji hlavni obrazovce (vpravo dole modry ctverecek) popr. <a href=https://www.truckmanager.eu/manual/apk/apk.html>zde</a>\n<b>JE OPRAVDU DULEZITE provest zakladni skoleni ridicu a seznamit je s manualem.</b>\nV pripade zajmu o skoleni dispeceru muzeme provest vzdalenou prezentaci pomoci software Any Desk <a href=https://anydesk.com/en/downloads/thank-you?dv=win_exe>ke stazeni zde</a>\n\nV pripade problemu volejte linku pomoci +420,737 288 090\n\nTesime se na spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\n\n1.Ceska obchodni, spol. s r.o.\nPotocni 340\n592 14 Nove Veseli\nCzech Republic\nVAT:CZ607 433 95\n\nprovider of server\n<a href=https://www.truckmanager.eu>www.truckmanager.eu</a>' },
  { id: '3', group: 'Noví uživatelé', label: 'TruckManager - sestavy a manualy', note_type: 'O',
    subject: 'TruckManager - sestavy a manualy',
    text: 'Zprava pro: <+company+>\n\nDobry den <+acc_sex+> <+acc_name+>,\n\nposilam vam ukazku ucetnich sestav a manualu pro ridice:\n\n<strong>CESTOVNI NAHRADY</strong> <a href= http://www.truckmanager.eu/reports/Cestovni_nahrady.xlsx>(stahni soubor)</a>\n\n<strong>EVIDENCE PRACOVNI DOBY</strong> <a href= http://www.truckmanager.eu/reports/Evidence_pracovni_doby.xlsx>(stahni soubor)</a>\n\n<strong>ZAZNAM O PROVOZU VOZIDLA</strong> <a href= http://www.truckmanager.eu/reports/Zaznam_o_provozu.xlsx>(stahni soubor)</a>\n\n<strong>MANUAL PRO RIDICE</strong> <a href= http://www.truckmanager.eu/reports/Manual_pro_ridice.pdf>(stahni soubor)</a>\n\n<strong>SPECIALNI MANUAL PRO PREPRAVCE DREVA</strong> <a href= http://www.truckmanager.eu/reports/Manual_pro_prepravu_dreva.pdf>(stahni soubor)</a>\n\nV pripade problemu volejte linku pomoci +420,737 288 090\n\nTesime se na spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\nFax: <+employee_fax+>\n\n1.Ceska obchodni, spol. s r.o.\nPotocni 340\n592 14 Nove Veseli\nCzech Republic\nVAT:CZ607 433 95\n\nprovider of server\n<a href=http://www.truckagenda.eu>TruckAgenda.eu</a>' },
  { id: '4', group: 'Noví uživatelé', label: 'TruckAgenda - nabídka prezentace', note_type: 'H',
    subject: 'TruckAgenda - nabidka prezentace dopravniho software.',
    text: 'Dobry den <+acc_sex+> <+acc_name+>,\n\nmel jste zajem o prezentaci a zaskoleni v dopravnim software TruckAgenda. Mame pro vas vse pripravene a nastavene. Kdy by se vam to hodilo? Muze to byt pro zacatek jen 30-60min.\n\nProgram Any Desk pro vzdalenou podporu stahnete <a href=https://anydesk.com/en/downloads/thank-you?dv=win_exe>zde</a>.\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\nFax: <+employee_fax+>\n\n1.Ceska obchodni, spol. s r.o.\nPotocni 340\n592 14 Nove Veseli\nCzech Republic\nVAT:CZ607 433 95\n\nprovider of server\n<a href=http://www.truckagenda.eu>TruckAgenda.eu</a>' },
  { id: '5', group: 'Noví uživatelé', label: 'TruckAgenda - základní funkce', note_type: 'N',
    subject: 'TruckAgenda - dopravni a spedicni software pro vasi firmu.',
    text: 'Dobry den <+acc_sex+> <+acc_name+>,\n\nna zaklade naseho telefonickeho rozhovoru vam posilam odkaz na informace o dopravnim a spedicnim software <a href=https://www.truckagenda.eu>TruckAgenda.eu</a>\n\nLze propojit vsechny cinnosti a pracovniky ve vasi firme: Dispecery - Ridice - Ucetni - Vedeni.\n\nVybrane zakladni funkce:\n<a href=https://www.truckagenda.eu/cs/online-dynamicka-dispecerska-plachta.html>- Online dispecerska plachta.</a>\n<a href=https://www.truckagenda.eu/cs/rozpis-diar-nakladek-vykladek.html>- Rozpis nakladek a vykladek do navigace ridice.</a>\n<a href=https://www.truckagenda.eu/cs/automaticka-fakturace-preprav-dopravy.html>- Automaticka fakturace s exportem do ucetnictvi.</a>\n... a mnoho dalsich funkci i na vase prani\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <a href=mailto:info@truckmanager.eu>info@truckmanager.eu</a>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\n<a href=https://www.truckagenda.eu>www.TruckAgenda.eu</a>' },
  { id: '6', group: 'Noví uživatelé', label: 'TruckAgenda - termin prezentace', note_type: 'O',
    subject: 'TruckAgenda - potvrzeni terminu prezentace nebo skoleni',
    text: 'Dobry den <+acc_sex+> <+acc_name+>,\n\ntimto potvrzuji dohodnuty termin xx.xx. 00:00hod prezentace a skoleni dopravniho software <a href=https://www.truckagenda.eu>TruckAgenda.eu</a>.\nVe vetsine pripadu nam staci 45-60min a budete moci si pak vse vyzkouset a vyuzivat i u vas.\n\nPrezentace bude probihat pomoci programu <a href=https://anydesk.com/en/downloads/thank-you?dv=win_exe>Any Desk</a>.\n\nS pozdravem\n<+employee_name+>\n\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\nFax: <+employee_fax+>\n\n<a href=https://truckagenda.eu>www.TruckAgenda.eu</a>' },
  // ── Zavedení uživatelé ────────────────────────────────────────────────────
  { id: '20', group: 'Zavedení uživatelé', label: 'Předplatili si služby', note_type: 'O',
    subject: 'TruckManager.eu - predplatne',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\ndne <+sys_date+> jsme od Vas obdrzeli platbu na predplatne sluzeb systemu TruckManager.eu\nNyni je Vas pristup ke vsem nasim sluzbam otevren do <+admittance_date+>.\n\nTesime se na spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\n\n1.Ceska obchodni, spol. s r.o.\nPotocni 340\n592 14 Nove Veseli\nCzech Republic\nVAT:CZ607 433 95\n\nprovider of server\n<a href=http://www.truckagenda.eu>TruckAgenda.eu</a>' },
  { id: '21', group: 'Zavedení uživatelé', label: 'Zaslano zapomenute heslo', note_type: 'O',
    subject: 'TruckManager.eu - zapomenute heslo',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\nna zaklade Vasi zadosti Vam zasilam Vase prihlasovaci udaje:\n\nPristup ke sluzbam systemu TruckManager.eu mate do <+admittance_date+>.\nuz.jmeno: <+username+>\n   heslo: <+password+>\n<a href=http://app.truckmanager.eu>app.truckmanager.eu</a>\n\nTesime se na spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\n\n1.Ceska obchodni, spol. s r.o.\nPotocni 340\n592 14 Nove Veseli\nCzech Republic\nVAT:CZ607 433 95\n\nprovider of server\n<a href=http://www.truckagenda.eu>TruckAgenda.eu</a>' },
  { id: '22', group: 'Zavedení uživatelé', label: 'Zásilka - dobírka', note_type: 'W',
    subject: 'TruckManager.eu - zasilka',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\nna zaklade Vasi objednavky Vam zasilame Ceskou postou balik.\n\nManualy pro ridice naleznete <a href=https://www.truckmanager.eu/cs/dn.html#Manual_TM>zde</a>\n<b>JE OPRAVDU DULEZITE provest zakladni skoleni ridicu nebo alespon jim predat tisteny manual.</b>\nNejnovejsi verzi programu Dispecer stahnete <a href=http://www.truckmanager.eu/dn/tm.apk>ZDE.</a>\n\nV pripade problemu volejte linku pomoci +420-737 288 090\n\nTesime se na spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\n\n1.Ceska obchodni, spol. s r.o.\nPotocni 340\n592 14 Nove Veseli\nCzech Republic\nVAT:CZ607 433 95\n\nprovider of server\n<a href=http://www.truckagenda.eu>TruckAgenda.eu</a>' },
  { id: '23', group: 'Zavedení uživatelé', label: 'Nastaveni mail serveru (DNS/SPF)', note_type: 'H',
    subject: 'TruckAgenda - nastaveni mail serveru',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\npro spravne fungovani odesilani emailu z TruckAgendy.eu s adresou odesilatele z domeny Vasi firmy je nutne nasledujici nastaveni vasich zaznamu DNS:\n\nUpravit existujici/pridat TXT zaznam domeny zacinajici v=spf1 .... tak, aby obsahoval include=spf.truckmanager.eu\nPriklad: @ IN TXT v=spf1 ip4:193.19.177.0/24 include:spf.truckmanager.eu -all\n\nDale pak je nutne pridat novy TXT zaznam:\ntmdb._domainkey IN TXT v=DKIM1; k=rsa; s=email; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDJwsbiNZkYMPesDFkfjlviy9uerj4b9s9fFESzGj9zIucyDG0k+yiaqcndvRlOvS/C9FwnWRicre8AIHh/XSZY2/AQSLG3mnZzXvnbXiSuwrWm5N5WZrpWa19EWbxC0y8IkrS5lxbMWV7GpPtnsrJxXjFXccdcIffNnfkzxaZ2XwIDAQAB\n\nTesim se na dalsi spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>\nFax: <+employee_fax+>' },
  { id: '24', group: 'Zavedení uživatelé', label: 'Volné náklady na mobil', note_type: 'O',
    subject: 'Volne naklady na mobil',
    text: 'Dekujeme, ze Vam muzeme zasilat nabidky nakladu od nasich partneru.\n<b>Nejste u PC?</b>\nI pro Vas mame reseni. Muzeme vam posilat nabidky volnych nakladu na Vas mobil\n\nNabizejte sva volna auta a naklady i formou SMS v tomto tvaru napr.:\n<b><+id+> Auto D709Stuttgart+100 - CZ 24t 5.-7.9. N13,6</b>\nSve nabidky pak posilejte na tel.cis. <b>+420,737 288 098</b>.\n\nVariabilni symbol: <b>57<+id+></b>\nCislo bankovniho uctu pro Ceskou rep.: <b>5361660277/0100</b>\nCislo bankovniho uctu pro Slovensko: <b>27-1742680257/8100</b>\nCena 100 SMS: <b>345,10Kc / 368,00SK</b>\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <a href=mailto:info@e-sped.cz>info@e-sped.cz</a>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '25', group: 'Zavedení uživatelé', label: 'TopTrucks - označení pro tisk', note_type: 'O',
    subject: 'TopTrucks - oznaceni polozek do tistene verze',
    text: '<+acc_sex+> <+acc_name+>,\n\nmate-li zajem otisknout nektere z Vasich nabidek v pripravovanem cisle TopTrucks, označte si prosím libovolné množství položek.\n\n<a href=http://www.toptrucks.cz>www.TopTrucks.cz</a>\nVase prihlasovaci udaje\nuz.jmeno: <+username+>\n   heslo: <+password+>\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <a href=mailto:info@e-sped.cz>info@e-sped.cz</a>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '26', group: 'Zavedení uživatelé', label: 'Nové za staré (obnova telefonu)', note_type: 'N',
    subject: 'TruckManager - Nove za stare (obnova GPS jednotek) jiz od 1.990,-Kc',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\ndle nasich zaznamu pouzivaji nekteri vasi ridici telefon starsi jak 1200 dni.\n\nNabizime Vam nyni nove vhodne telefony i s prislusenstvim (navigace, magneticky drzak, nabijecka) za ceny od <strong>1.990,-Kc</strong> bez DPH.\n\nSoucasti dodavky je vzdy take:\n- autonabijecka 3x USB 12/24V 4,4A\n- specialni magneticky nalepovaci drzak na palubni desku\n- ZDARMA nove mapy Mapfactor Navigator FREE\n- stylus na snadne psani a ovladani pro ridice s velkymi prsty\n\nVice o nabidce i v nasem <a href=https://www.truckmanager.eu/cs/cenik.html>ceniku</a>\n\nTesime se na spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  // ── Kombajn ──────────────────────────────────────────────────────────────
  { id: '50', group: 'Kombajn', label: 'Nepředplácí - přístup ZDARMA', note_type: 'N',
    subject: 'Euro Sped Online - sluzby ZDARMA',
    text: '<+acc_sex+> <+acc_name+>,\n\nvelice si vazime toho, ze jsme s Vami mohli v minulosti spolupracovat a radi bychom na nasi predchozi spolupraci navazali.\n\nNabizime Vam proto nyni nase sluzby zcela ZDARMA do <+admittance_date+> a doufame, ze nase spoluprace bude jeste kvalitnejsi nez drive.\n\nVase prihlasovaci udaje\nuz.jmeno: <+username+>\n   heslo: <+password+>\n<a href=http://www.truckmanager.eu>www.truckmanager.eu</a>\n\nTesime se na dalsi spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '51', group: 'Kombajn', label: 'Nepředpláceli - 2 za cenu 1', note_type: 'O',
    subject: 'Euro Sped Online - 2 za cenu 1',
    text: '<+acc_sex+> <+acc_name+>,\n\ndne <+admittance_date+> Vam vyprsel pristup ke sluzbam centra Euro Sped Online.\nVelice si vazime moznosti s Vami spolupracovat a radi bychom na nasi predchozi spolupraci navazali.\n\nNabizime Vam proto 50% slevu na nase sluzby.\n\nV pripade, ze nabidku vyuzijete a <b>do <+sys_dateX+></b> si predplatite 1-12 mesicu, budeme Vam radi poskytovat nase sluzby 2x tak dlouho.\n\nVariabilni symbol: <b>51<+id+></b>\nPredlatne na 12 mesicu s 50% slevou: <b>4 926,60Kc</b>\nCislo uctu: <b>536 166 0277/0100</b>\n\nuz.jmeno: <b><+username+></b>\n   heslo: <b><+password+></b>\n\nTesime se na dalsi spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '52', group: 'Kombajn', label: 'Urgence instalace aplikace TM', note_type: 'H',
    subject: 'TruckManager - instalace aplikace TruckManager',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\nzakoupili jste u nas PDA s programem TruckManager.\nVas pristup byl otevren do <+admittance_date+>.\n\nZatim jste vsak neprovedli registraci SIM karty a programu TruckManager.\nMate-li jakekoliv problemy s instalaci nebo komunikaci volejte linku pomoci +420-737 288 090\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '53', group: 'Kombajn', label: 'Nepřipojují - nabídka pomoci', note_type: 'C',
    subject: 'Euro Sped Online - nabidka technicke pomoci',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\nv posledni dobe jsme nezaznamenali zadne Vase spojeni s nasim centrem spedicnich informaci <a href=http://www.truckmanager.eu>Euro Sped Online</a>.\n\nMate-li nejake problemy s praci na webovych strankach nebo programem Dispecer, volejte linku pomoci <b>+420-737 288 090</b>. Nasi technici Vam jiste pomohou nebo naleznou vhodne reseni.\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '54', group: 'Kombajn', label: 'Nevkládají - info o TIPu + nabídka pomoci', note_type: 'A',
    subject: 'Euro Sped Online - neuplne vyuzivani sluzeb',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\njiz delsi dobu jsme od Vas neobdrzeli zadne nabidky Vasich volnych aut nebo nakladu.\n\nNemuze Vam proto zasilat vhodne TIPy na Vas:\n<+tip+>\n\nPotrebujete-li s necim poradit nebo pomoci kontaktujte mne a spolecne jiste reseni nalezneme.\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '56', group: 'Kombajn', label: 'Stará verze TM - nabídka upgrade', note_type: 'O',
    subject: 'Euro Sped Online - nova verze programu TruckManager',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\njiz delsi dobu je uvolnena nova verze programu TruckManager.\nOproti predchozi verzi opet nabizi nove funkce ale predevsim byly odstraneny nektere nedostatky coz prinasi zvysenou stabilitu.\n\nPri aktualizaci staci souhlasit s nabizenym Upgrade nebo si stanete instalaci teto nove verze:\n<a href=http://pda.truckmanager.eu/info/stahuj.php>Stahuj</a>\n\nV pripade problemu volejte linku pomoci <b>+420-737 288 090</b>\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '57', group: 'Kombajn', label: 'Upomínka pohledávek', note_type: 'U',
    subject: 'TruckManager.eu - UPOMINKA platby',
    text: 'Zprava pro: <+company+>\n\n<+acc_sex+> <+acc_name+>,\n\nvazime si Vasi spoluprace, avsak pri kontrole nasich ucetnich dokladu jsme zjistili, ze nemame uhrady nekterych Vam vystavenych faktur.\n\ncis. faktury ... datum spl. . castka\n<+claim_invoice+>\nVerim, ze uhradu provedete do 7 dnu na nas ucet\nCSOB Zdar/Saz. c.u. <b>226 154 811/0300.</b>\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  // ── AKCE ─────────────────────────────────────────────────────────────────
  { id: '78', group: 'AKCE', label: 'TM nabídka + videoprezentace', note_type: 'N',
    subject: 'TruckManager - sledovani s navigaci a komunikaci po Evrope ZDARMA',
    text: 'p. <+acc_name+>,\n\nna zaklade naseho telefonickeho rozhovoru a jeste predtim, nez si vam dovolim ve 14.00hod opet zavolat, bych Vam rada predstavila nas system TruckManager pro sledovani vozidel s levnou komunikaci s ridici.\n\nPodivejte se prosim na podrobneho VIDEOPRUVODCE:\n<a href=http://www.truckmanager.cz/pruvodce.htm>http://www.truckmanager.cz/pruvodce.htm</a>\n\nVice o systemu, Cenach a Nejcasteji kladenych dotazech primo na strankach:\n<a href=http://www.truckmanager.cz>http://www.truckmanager.cz</a>\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '79', group: 'AKCE', label: 'TM - nastaveni PC pro videoprezentaci', note_type: 'N',
    subject: 'TruckManager - videoprezentace (nastaveni PC)',
    text: 'p. <+acc_name+>,\n\nradi bychom Vam predstavili nas system pro sledovani vozidel a levnou komunikaci s ridici <a href=http://www.truckmanager.cz>www.TruckManager.cz</a>.\n\nJe nutne vsak nejdrive zkontrolovat nastaveni vaseho PC.\n1) V prohlizeci zadejte adresu: <a href=http://gw.truckmanager.eu:5802>http://gw.truckmanager.eu:5802</a>\n2) Zobrazi-li se okno s dotazem na spusteni - zvolte Run\n3) Zobrazi se barevny napis REAL VNC - jako server uvedte gw.truckmanager.eu:2\n4) Zobrazi-li se okno pro vlozeni hesla je vse OK a muzete si objednat termin videoprezentace.\n\nTesime se na dalsi spolupraci\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '80', group: 'AKCE', label: 'Dotazník - 17 vychytávek', note_type: 'N',
    subject: 'TruckManager - 17 vychytavek i pro Vas.',
    text: 'p. <+acc_name+>,\n\nzajimal by nas vas nazor na funkce, ktere si nechali na miru vytvorit nekteri nasi uzivatele. Mozna by i Vam zjednodusil praci a usetril cas i penize.\n\n<a href=https://docs.google.com/forms/d/e/1FAIpQLSfQeV4c4dR-p1RvG9HfOszU3KtGVrDXeS00iy6h6xZqafANJg/viewform><b>Vyplnit dotaznik.</b></a>\n\nNa konci dotazniku si muzete dle nasi dohody vybrat odmenu.\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nGSM: <+employee_gsm+>' },
  { id: '81', group: 'AKCE', label: 'Nabídka spolupráce - prodejci', note_type: 'N',
    subject: 'Nabidka spoluprace - Stante se nasimi autorizovanymi prodejci',
    text: 'Dobry den!\n\nNa Vasich www strankach jsme se docetli, ze ve Vasi nabidce nechybi navigacni technika.\n\nJsme tvurci a provozovatele systemu TruckManager, ktery vyuziva PDA pro sledovani nakladnich vozidel, navigaci ridicu a levnou komunikaci ridic - dispecer.\n\nSystem je velmi atraktivni diky pomeru cena/vykon jak pri porizeni tak predevsim behem provozu.\n\nNabizime Vam uzkou spolupraci, podporu prodeje a zajimavy rabat.\n\nVice o systemu:\n<a href=http://www.truckmanager.cz/pruvodce.htm>www.truckmanager.cz/pruvodce.htm</a>\n\nTesime se na dalsi spolupraci\n\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '82', group: 'AKCE', label: 'TopTrucks - přehled možností zviditelnění', note_type: 'N',
    subject: 'TopTrucks: Vase nabidky - vsechny moznosti',
    text: 'p. <+acc_name+>,\n\ndekujeme, ze jsme mohli rozsirit Katalog pouzite dopravni techniky TopTrucks i o Vasi nabidku.\n\nMate-li zajem aktivne upozornit dopravni firmy na svou nabidku, vytvorili jsme pro Vas uceleny prehled moznosti.\n<a href=http://www.toptrucks.cz/scripts/objednavka.php?cped=<+company_key+>>Zde</a> naleznete veskere potrebne informace.\n\nTesime se na dalsi spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  { id: '83', group: 'AKCE', label: 'e-sped Servis - přehled možností zviditelnění', note_type: 'N',
    subject: 'e-sped Servis: Vase sluzby - vsechny moznosti',
    text: 'p. <+acc_name+>,\n\ninformace o Vasich sluzbach jsme (pro Vas ZDARMA) doplnili do naseho informacniho Servisu pro dopravce.\n\nZadame Vas o kontrolu spravnosti techto udaju a pripadnou opravu.\n<a href=http://ad.e-sped.cz/files/objednavka.php?cped=<+company_key+>>Zde</a> naleznete veskere potrebne informace.\n\nuz.jmeno: <b><+username+></b>\n   heslo: <b><+password+></b>\n\nTesime se na dalsi spolupraci.\nS pozdravem\n<+employee_name+>\n\nE-mail: <+employee_email+>\nTel: <+employee_phone+>\nGSM: <+employee_gsm+>' },
  // ── Vlastní ───────────────────────────────────────────────────────────────
  { id: 'custom', group: 'Vlastní', label: 'Vlastní zpráva', note_type: 'S', subject: '', text: '' },
]

const GROUPS = ['Noví uživatelé', 'Zavedení uživatelé', 'Kombajn', 'AKCE', 'Vlastní']

function applyCtx(text: string, ctx: Record<string, string>) {
  let r = text
  for (const [k, v] of Object.entries(ctx)) r = r.split(`<+${k}+>`).join(v)
  return r
}

export const SendEmailModal = ({ companyKey, initialEmail, onClose }: Props) => {
  const [tab, setTab] = useState<'send' | 'templates'>('send')
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES)
  const [templatesLoaded, setTemplatesLoaded] = useState(false)

  // Send tab state
  const [recipients, setRecipients] = useState<{ label: string; email: string }[]>(
    initialEmail ? [{ label: initialEmail, email: initialEmail }] : []
  )
  const [senders, setSenders] = useState<Record<string, { name: string; email: string }>>({})
  const [ctx, setCtx] = useState<Record<string, string>>({})
  const [to, setTo] = useState(initialEmail ?? '')
  const [sender, setSender] = useState('D')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [bcc, setBcc] = useState(false)
  const [bccEmail, setBccEmail] = useState('')
  const [noteType, setNoteType] = useState('S')
  const [activeGroup, setActiveGroup] = useState(GROUPS[0])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const msgRef = useRef<HTMLTextAreaElement>(null)

  // Edit templates tab state
  const [editTpl, setEditTpl] = useState<EmailTemplate | null>(null)
  const [savingTpls, setSavingTpls] = useState(false)

  useEffect(() => {
    getMailContext(companyKey).then(data => {
      if (data.recipients?.length) {
        setRecipients(data.recipients)
        if (!initialEmail) setTo(data.recipients[0].email)
      }
      if (data.senders) setSenders(data.senders)
      if (data.context) { setCtx(data.context); setBccEmail(data.context.employee_email ?? '') }
    }).catch(() => {})

    getEmailTemplates().then(data => {
      if (data?.length) setTemplates(data)
      setTemplatesLoaded(true)
    }).catch(() => setTemplatesLoaded(true))
  }, [companyKey])

  const handleTemplate = (tpl: EmailTemplate) => {
    setSubject(applyCtx(tpl.subject, ctx))
    setMessage(applyCtx(tpl.text, ctx))
    setNoteType(tpl.note_type)
    setTab('send')
    setTimeout(() => msgRef.current?.focus(), 50)
  }

  const handleSend = async () => {
    if (!to || !subject.trim() || !message.trim()) return
    setSending(true); setError('')
    try {
      await sendMail({ company_key: Number(companyKey), to, sender, subject, message, bcc, bcc_email: bcc ? bccEmail : undefined, note_type: noteType, note_text: subject })
      setSent(true)
      setTimeout(onClose, 1200)
    } catch (e: any) { setError(e.message) }
    finally { setSending(false) }
  }

  const handleSaveTemplates = async () => {
    setSavingTpls(true)
    try { await saveEmailTemplates(templates) }
    catch (e: any) { alert(e.message) }
    finally { setSavingTpls(false) }
  }

  const handleEditField = (field: keyof EmailTemplate, value: string) => {
    if (!editTpl) return
    const updated = { ...editTpl, [field]: value }
    setEditTpl(updated)
    setTemplates(ts => ts.map(t => t.id === updated.id ? updated : t))
  }

  const groupTemplates = templates.filter(t => t.group === activeGroup)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Hlavička */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-gray-800 font-semibold">
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              Odeslat e-mail
            </div>
            <div className="flex gap-1 text-sm">
              <button onClick={() => setTab('send')}
                className={`px-3 py-1 rounded-lg transition-colors ${tab === 'send' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                Odeslat
              </button>
              <button onClick={() => setTab('templates')}
                className={`px-3 py-1 rounded-lg transition-colors ${tab === 'templates' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                Vzory
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── TAB: Odeslat ── */}
        {tab === 'send' && (
          <>
            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              {/* Skupiny vzorů */}
              <div>
                <div className="flex gap-1 flex-wrap mb-2">
                  {GROUPS.map(g => (
                    <button key={g} onClick={() => setActiveGroup(g)}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${activeGroup === g ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'}`}>
                      {g}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {groupTemplates.map(tpl => (
                    <button key={tpl.id} onClick={() => handleTemplate(tpl)}
                      className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors text-gray-700">
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Příjemce */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Příjemce</label>
                {recipients.length > 1 ? (
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={to} onChange={e => setTo(e.target.value)}>
                    {recipients.map(r => <option key={r.email} value={r.email}>{r.label}</option>)}
                  </select>
                ) : (
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={to} onChange={e => setTo(e.target.value)} placeholder="E-mail příjemce" />
                )}
              </div>

              {/* Odesílatel */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Odesílatel</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={sender} onChange={e => setSender(e.target.value)}>
                  {Object.entries(senders).map(([key, s]) => (
                    <option key={key} value={key}>{s.name} &lt;{s.email}&gt;</option>
                  ))}
                </select>
              </div>

              {/* Předmět */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Předmět</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={subject} onChange={e => setSubject(e.target.value)} placeholder="Předmět zprávy" />
              </div>

              {/* Zpráva */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Zpráva</label>
                <textarea ref={msgRef} rows={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
                  value={message} onChange={e => setMessage(e.target.value)} placeholder="Text zprávy..." />
              </div>

              {/* BCC */}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={bcc} onChange={e => setBcc(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                <span className="text-gray-700">BCC</span>
                {bcc && (
                  <input className="ml-1 flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={bccEmail} onChange={e => setBccEmail(e.target.value)} placeholder="BCC e-mail" />
                )}
              </label>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              {sent && <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">E-mail odeslán.</p>}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Zrušit</button>
              <button onClick={handleSend} disabled={sending || sent || !to || !subject.trim() || !message.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {sending ? <Spinner size={4}/> : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                  </svg>
                )}
                Odeslat
              </button>
            </div>
          </>
        )}

        {/* ── TAB: Vzory ── */}
        {tab === 'templates' && (
          <>
            <div className="flex flex-1 overflow-hidden">
              {/* Seznam vzorů */}
              <div className="w-56 border-r border-gray-200 overflow-y-auto shrink-0">
                {GROUPS.map(g => {
                  const gTpls = templates.filter(t => t.group === g)
                  return (
                    <div key={g}>
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">{g}</div>
                      {gTpls.map(tpl => (
                        <button key={tpl.id} onClick={() => setEditTpl({ ...tpl })}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors border-b border-gray-50 ${editTpl?.id === tpl.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* Editor vzoru */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {editTpl ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Název</label>
                      <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        value={editTpl.label} onChange={e => handleEditField('label', e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Skupina</label>
                        <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          value={editTpl.group} onChange={e => handleEditField('group', e.target.value)}>
                          {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Typ poznámky</label>
                        <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                          value={editTpl.note_type} maxLength={1} onChange={e => handleEditField('note_type', e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Předmět</label>
                      <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        value={editTpl.subject} onChange={e => handleEditField('subject', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Text</label>
                      <textarea rows={12}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
                        value={editTpl.text} onChange={e => handleEditField('text', e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 text-center pt-16">Vyberte vzor ze seznamu</div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100 shrink-0">
              <span className="text-xs text-gray-400">{templates.length} vzorů</span>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Zavřít</button>
                <button onClick={handleSaveTemplates} disabled={savingTpls}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {savingTpls ? <Spinner size={4}/> : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                  Uložit vzory
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
